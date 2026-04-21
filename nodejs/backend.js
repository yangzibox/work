import express from 'express';

const app = express();

// 立即启动服务器
const server = app.listen(3000, () => {
    console.log('服务器启动');
    console.log('可用: http://localhost:3000/api/1');
    console.log('可用: http://localhost:3000/api/2');
    console.log('可用: http://localhost:3000/api/3');
    console.log('其他: 返回 404');
});

// 定义处理函数
const get_api_1 = (req, res) => {
    res.send("I'm API 1");
};

const get_api_2 = (req, res) => {
    res.send("I'm API 2");
};

const get_api_3 = (req, res) => {
    res.send("I'm API 3");
};

// 路由绑定
app.get('/api/1', get_api_1);
app.get('/api/2', get_api_2);
app.get('/api/3', get_api_3);

// 其它用 app.use() 而不是 app.all('*')
app.use((req, res) => {
    res.status(404).send('404 - 只允许 /api/1, /api/2 和 /api/3');
});