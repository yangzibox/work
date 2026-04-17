const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { openid } = event
    
    if (!openid) {
      return { code: 400, message: '需要openid' }
    }
    
    const result = await db.collection('checkins')
      .where({
        openid: openid
      })
      .orderBy('serverTime', 'asc')  // 按服务器时间升序
      .get()
    
    return {
      code: 200,
      data: result.data,
      total: result.data.length
    }
    
  } catch (err) {
    return { 
      code: 500, 
      message: err.message 
    }
  }
}