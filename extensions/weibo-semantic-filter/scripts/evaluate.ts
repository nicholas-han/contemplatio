import {readFile} from 'node:fs/promises';import {evaluate} from '../src/shared/evaluation';
const path=process.argv[2];if(!path)throw Error('用法：npm run evaluate -- /path/to/weibo-feedback.json');
const data=JSON.parse(await readFile(path,'utf8'));if(data.format!=='weibo-feedback-v1'||!Array.isArray(data.rows))throw Error('反馈文件格式无效');
console.log(JSON.stringify(evaluate(data.rows),null,2));
