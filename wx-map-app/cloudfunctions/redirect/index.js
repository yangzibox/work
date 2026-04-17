// cloudfunctions/redirect/index.js
const https = require('https')
const http = require('http')
const url = require('url')
const querystring = require('querystring')

async function main(event, context) {
  try {
    if (!event.api) {
      return {
        success: false,
        error: "Missing 'api' parameter"
      }
    }

    const targetUrl = event.api
    const parsedUrl = url.parse(targetUrl)

    const postData = querystring.stringify(
      Object.keys(event).reduce((acc, key) => {
        if (key !== 'api') acc[key] = event[key]
        return acc
      }, {})
    )

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      agent: parsedUrl.protocol === 'https:' ? new https.Agent({ rejectUnauthorized: false }) : undefined
    }

    const data = await new Promise((resolve, reject) => {
      const req = (parsedUrl.protocol === 'https:' ? https : http).request(options, (res) => {
        let rawData = ''
        res.on('data', (chunk) => rawData += chunk)
        res.on('end', () => resolve(rawData))
      })

      req.on('error', (err) => reject(err))
      req.write(postData)
      req.end()
    })

    return {
      success: true,
      statusCode: 200,
      data
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}

// ⚠️ 微信云函数要求必须 export main
module.exports = { main }