const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { timestamp, openid, latitude, longitude } = event
    
    if (!timestamp || !openid || latitude === undefined || longitude === undefined) {
      return { 
        code: 400, 
        message: '缺少必要参数'
      }
    }
    
    const data = {
      openid: openid,
      timestamp: Number(timestamp),
      latitude: Number(latitude),
      longitude: Number(longitude),
      serverTime: db.serverDate()  // 服务器时间
    }
    
    const result = await db.collection('checkins').add({ data })
    
    return {
      code: 200,
      message: 'ok',
      data: { _id: result._id }
    }
    
  } catch (err) {
    return { 
      code: 500, 
      message: err.message 
    }
  }
}