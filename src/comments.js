export function parseNote(value) {
 if(/^[a-f0-9]{24}$/i.test(value||''))return{id:value,token:''};
 let url;try{url=new URL(value);}catch{throw Error('comments 需要24位笔记ID或完整小红书笔记链接');}
 if(url.protocol!=='https:'||url.hostname!=='www.xiaohongshu.com')throw Error('仅接受 https://www.xiaohongshu.com 笔记链接');
 const id=url.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/i)?.[1];
 if(!id)throw Error('笔记链接格式不正确');
 return{id,token:url.searchParams.get('xsec_token')||''};
}
const field=(v,snake,camel)=>v?.[snake]??v?.[camel];
export function normalizeComment(c) {
 const u=field(c,'user_info','userInfo')||{},target=field(c,'target_comment','targetComment');
 return{
  id:c.id,content:c.content??'',create_time:field(c,'create_time','createTime')??null,
  like_count:Number(field(c,'like_count','likeCount')||0),
  user:{id:field(u,'user_id','userId')??null,nickname:u.nickname??''},
  reply_to_id:target?.id??null,
  reply_count:Number(field(c,'sub_comment_count','subCommentCount')||0),
  reply_cursor:field(c,'sub_comment_cursor','subCommentCursor')||'',
  replies_has_more:Boolean(field(c,'sub_comment_has_more','subCommentHasMore')),
  replies:(field(c,'sub_comments','subComments')||[]).map(normalizeComment),
 };
}
function pageData(data){
 if(!data||!Array.isArray(data.comments))throw Error('评论响应结构变化：缺少comments数组');
 const more=field(data,'has_more','hasMore');
 if(typeof more!=='boolean')throw Error('评论响应缺少has_more分页标记');
 return{comments:data.comments,cursor:data.cursor||'',hasMore:more};
}
export async function isWebAuthenticated(page,context){
 const cookies=await context.cookies('https://www.xiaohongshu.com');
 const gated=await page.getByText('登录查看全部评论内容',{exact:true}).isVisible()
  ||await page.getByText('登录后评论',{exact:true}).isVisible();
 return !gated&&cookies.some(c=>c.name==='web_session'&&c.value)
  &&await page.getByRole('link',{name:'我',exact:true}).first().isVisible();
}
const errorMessage=error=>(error.message||String(error)).split('\n')[0];

export async function readCommentPages({noteId,initial,pages=1,replies=false,fetchPage,fetchReplies,authenticated=true,continuePage=async()=>true,onPage=async()=>{}}){
 const result={note_id:noteId,comments:[],pages_fetched:1,cursor:'',has_more:false,complete:false,errors:[],warnings:[]};
 const roots=new Map();
 let stopped=false;
 let current=pageData(initial);
 const append=items=>{for(const raw of items)if(raw.id&&!roots.has(raw.id))roots.set(raw.id,{raw,comment:normalizeComment(raw)});};
 append(current.comments);
 await onPage({scope:'comments',page:1,comments:current.comments,hasMore:current.hasMore});
 const cursors=new Set();
 if(!authenticated)result.warnings.push('主站未登录，评论可能不完整；请执行 xhs login --site web');
 while(authenticated&&current.hasMore&&result.pages_fetched<pages){
  if(!await continuePage({scope:'comments',page:result.pages_fetched,hasMore:true})){stopped=true;break;}
  if(!current.cursor||cursors.has(current.cursor)){result.errors.push({scope:'comments',message:'分页游标未前进，已停止'});break;}
  cursors.add(current.cursor);
  try{const next=pageData(await fetchPage(current.cursor));append(next.comments);result.pages_fetched++;current=next;await onPage({scope:'comments',page:result.pages_fetched,comments:next.comments,hasMore:next.hasMore});}
  catch(error){result.errors.push({scope:'comments',message:errorMessage(error)});break;}
 }
 for(const {raw,comment} of roots.values()){
  if(stopped)break;
  if(!replies||!authenticated)continue;
  let cursor=field(raw,'sub_comment_cursor','subCommentCursor')||'',more=comment.replies_has_more;
  const seen=new Set(),items=new Map(comment.replies.map(c=>[c.id,c]));
  let replyPages=0;
  while(more&&replyPages<pages){
   if(!await continuePage({scope:'replies',page:replyPages+1,comment,hasMore:true})){stopped=true;break;}
   if(!cursor||seen.has(cursor)){result.errors.push({scope:'replies',comment_id:comment.id,message:'回复分页游标未前进，已停止'});break;}
   seen.add(cursor);
   try{
    const next=pageData(await fetchReplies(comment.id,cursor));
    for(const c of next.comments)if(c.id&&!items.has(c.id))items.set(c.id,normalizeComment(c));
    cursor=next.cursor;more=next.hasMore;
    replyPages++;await onPage({scope:'replies',page:replyPages,comment,comments:next.comments,hasMore:more});
   }catch(error){result.errors.push({scope:'replies',comment_id:comment.id,message:errorMessage(error)});break;}
  }
  comment.replies=[...items.values()];comment.replies_has_more=more;
 }
 result.comments=[...roots.values()].map(x=>x.comment);
 result.cursor=current.cursor;result.has_more=current.hasMore;
 result.complete=authenticated&&!current.hasMore&&!result.errors.length&&!result.comments.some(c=>c.replies_has_more||c.reply_count>c.replies.length);
 return result;
}

// Reuse the observed application API client: it supplies the platform's normal
// signing and request handling. Select exports by their original function names.
async function applicationRequest(page,kind,params){
 return page.evaluate(async({kind,params})=>{
  let require;
  if(!self.webpackChunkxhs_pc_web)throw Error('主站客户端尚未加载');
  self.webpackChunkxhs_pc_web.push([[`xhs-cli-comments-${Date.now()}`],{},r=>{require=r;}]);
  const entry=Object.entries(require.m).find(([,factory])=>factory.toString().includes('function getApiSnsWebV2CommentPage('));
  if(!entry)throw Error('主站评论客户端已变化，请更新CLI');
  const api=require(entry[0]);
  const name=kind==='replies'?'getApiSnsWebV2CommentSubPage':'getApiSnsWebV2CommentPage';
  const fn=Object.values(api).find(value=>typeof value==='function'&&value.name===name);
  if(!fn)throw Error('未找到评论分页方法');
  return await fn({params});
 },{kind,params});
}

export async function comments(session,o){
 const {page,context}=session,note=parseNote(o.id);
 const continuation=Boolean(o.cursor||o['reply-cursor']);
 const token=o['xsec-token']||note.token;
 if(!token)throw Error('请提供带 xsec_token 的笔记链接，或使用 --xsec-token；CLI 不再自动翻找笔记令牌');
 if(continuation)await page.route('https://edith.xiaohongshu.com/api/sns/web/v2/comment/page**',route=>route.abort());
 const initialResponse=continuation?null:page.waitForResponse(r=>{
  const u=new URL(r.url());return u.hostname==='edith.xiaohongshu.com'&&u.pathname==='/api/sns/web/v2/comment/page'&&u.searchParams.get('note_id')===note.id;
 },{timeout:o.timeout});
 const navigation=page.goto(`https://www.xiaohongshu.com/explore/${note.id}?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_note`,{waitUntil:'domcontentloaded',timeout:o.timeout});
 const [response]=initialResponse?await Promise.all([initialResponse,navigation]):[null,await navigation];
 await page.locator('.note-scroller').waitFor({state:'visible',timeout:o.timeout});
 // The site also issues web_session to anonymous visitors; a cookie alone is
 // insufficient. Respect the rendered login gate before requesting more data.
 const authenticated=await isWebAuthenticated(page,context);
 if(continuation&&!authenticated)throw Error('续取分页需要主站登录，请先执行 xhs login --site web');
 const params={noteId:note.id,topCommentId:'',imageFormats:'jpg,webp,avif',xsecToken:token};
 if(o['reply-cursor']&&!o['root-comment-id'])throw Error('--reply-cursor 必须同时提供 --root-comment-id');
 if(o['root-comment-id']&&!o['reply-cursor'])throw Error('--root-comment-id 必须同时提供 --reply-cursor');
 if(o.replies)throw Error('已取消自动追加回复；请先读取 reply_cursor，再用 --reply-cursor 和 --root-comment-id 单独请求一页');
 let data;
 if(o['reply-cursor'])data=await applicationRequest(page,'replies',{...params,rootCommentId:o['root-comment-id'],cursor:o['reply-cursor'],num:10});
 else if(o.cursor)data=await applicationRequest(page,'comments',{...params,cursor:o.cursor});
 else {
  const body=await response.json();
  if(!response.ok()||body.success!==true)throw Error(`评论查询失败：${body.msg||body.code||response.status()}；请先执行 xhs login --site web`);
  data=body.data;
 }
 const result=await readCommentPages({noteId:note.id,initial:data,pages:1,authenticated,replies:false});
 result.scope=o['reply-cursor']?'replies':'comments';
 if(o['root-comment-id'])result.root_comment_id=o['root-comment-id'];
 return result;
}
