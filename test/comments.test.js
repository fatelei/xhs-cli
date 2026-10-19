import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNote,normalizeComment,readCommentPages,isWebAuthenticated} from '../src/comments.js';
const id='6ace01f6000000000a023e48';
test('accepts a note ID or an official note URL, rejects foreign hosts',()=>{
 assert.deepEqual(parseNote(id),{id,token:''});
 assert.deepEqual(parseNote(`https://www.xiaohongshu.com/explore/${id}?xsec_token=abc`),{id,token:'abc'});
 assert.throws(()=>parseNote(`https://example.com/explore/${id}`));
});
test('normalizes content and replies from snake_case and camelCase without exporting tokens',()=>{
 const c=normalizeComment({id:'a',content:'评论🌍',like_count:'2',create_time:123,user_info:{user_id:'u',nickname:'名字',xsec_token:'secret'},sub_comments:[{id:'b',content:'回复',target_comment:{id:'a'}}],sub_comment_has_more:true});
 assert.equal(c.content,'评论🌍');assert.equal(c.like_count,2);assert.equal(c.replies[0].reply_to_id,'a');
 assert.equal(c.replies_has_more,true);assert.equal(JSON.stringify(c).includes('secret'),false);
 assert.equal(normalizeComment({id:'a',likeCount:'3',userInfo:{userId:'u'}}).user.id,'u');
});
test('paginates and deduplicates root comments and reply pages',async()=>{
 const result=await readCommentPages({noteId:id,pages:3,replies:true,initial:{comments:[{id:'a',content:'根',sub_comments:[{id:'b',content:'首条回复'}],sub_comment_has_more:true,sub_comment_cursor:'b'}],has_more:true,cursor:'p2'},fetchPage:async()=>({comments:[{id:'a'},{id:'c',content:'第二页'}],hasMore:false,cursor:'done'}),fetchReplies:async()=>({comments:[{id:'b'},{id:'d',content:'后续回复'}],hasMore:false,cursor:'d'})});
 assert.equal(result.comments.length,2);assert.equal(result.comments[0].content,'根');
 assert.equal(result.comments[0].replies.length,2);assert.equal(result.complete,true);
});
test('reports page limits, cursor loops and denied requests as partial results',async()=>{
 const initial={comments:[{id:'a',content:'保留'}],has_more:true,cursor:'one'};
 const limited=await readCommentPages({noteId:id,pages:1,initial});
 assert.equal(limited.complete,false);assert.equal(limited.has_more,true);
 const loop=await readCommentPages({noteId:id,pages:3,initial,fetchPage:async()=>initial});
 assert.equal(loop.complete,false);assert.match(loop.errors[0].message,/游标/);
 const denied=await readCommentPages({noteId:id,pages:3,initial,fetchPage:async()=>{throw Error('login required');}});
 assert.equal(denied.comments[0].content,'保留');assert.equal(denied.complete,false);
});
test('anonymous session cookies cannot enable restricted comment pagination',async()=>{
 const context={cookies:async()=>[{name:'web_session',value:'anonymous'}]};
 const page={getByText:()=>({isVisible:async()=>true})};
 assert.equal(await isWebAuthenticated(page,context),false);
 const result=await readCommentPages({noteId:id,pages:3,replies:true,authenticated:false,initial:{comments:[{id:'a',content:'可见评论'}],has_more:true,cursor:'next'},fetchPage:()=>{throw Error('must not run');}});
 assert.equal(result.pages_fetched,1);assert.equal(result.complete,false);
 assert.equal(result.errors.length,0);assert.equal(result.warnings.length,1);
});
test('logged-in sidebar identity and session are required together',async()=>{
 const context={cookies:async()=>[{name:'web_session',value:'session'}]};
 const page={getByText:()=>({isVisible:async()=>false}),getByRole:()=>({first:()=>({isVisible:async()=>true})})};
 assert.equal(await isWebAuthenticated(page,context),true);
 assert.equal(await isWebAuthenticated(page,{cookies:async()=>[]}),false);
});
