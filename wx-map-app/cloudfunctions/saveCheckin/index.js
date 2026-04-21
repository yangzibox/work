const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

// 方案1：使用内置的 request 模块
const request = require('request');

async function getAddressByLocation(latitude, longitude) {
  return new Promise((resolve, reject) => {
    const TENCENT_MAP_KEY = 'EYOBZ-3NRLW-WXFRX-3HJ44-BBUF7-GWFER';
    const url = `https://apis.map.qq.com/ws/geocoder/v1/?location=${latitude},${longitude}&key=${TENCENT_MAP_KEY}&get_poi=0`;

    request.get(url, (error, response, body) => {
      if (error) {
        console.error('请求失败:', error);
        resolve('地址解析失败');
        return;
      }

      try {
        const data = JSON.parse(body);
        if (data.status === 0) {
          resolve(data.result.address || '未知地址');
        } else {
          resolve('地址解析失败');
        }
      } catch (e) {
        console.error('解析失败:', e);
        resolve('地址解析失败');
      }
    });
  });
}

exports.main = async (event, context) => {
  try {
    const { timestamp, openid, latitude, longitude } = event

    if (!timestamp || !openid || latitude === undefined || longitude === undefined) {
      return {
        code: 400,
        message: '缺少必要参数'
      }
    }

    // 1. 获取地址信息
    const address = await getAddressByLocation(latitude, longitude);

    const data = {
      openid: openid,
      timestamp: Number(timestamp),
      latitude: Number(latitude),
      longitude: Number(longitude),
      address: address,
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