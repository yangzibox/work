// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk')

cloud.init()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  console.log('login 云函数被调用成功')

  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    success: true
  }
}