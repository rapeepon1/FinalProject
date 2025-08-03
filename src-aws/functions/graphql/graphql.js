const { graphql, buildSchema } = require('graphql');
const { usageData } = require('./resolvers/usageData'); // ตัวอย่าง
// import resolver ตัวอื่น ๆ เช่นเดียวกัน
const { realtime } = require('./resolvers/realtime');
const { stats } = require('./resolvers/stats');

const schema = buildSchema(`
  type Query {
    usageData(startDate: Int!, endDate: Int!): [DailySummary]!
    stats: Stats!
    realtime(sinceTimestamp: Int!): [Reading]!
    readings(startDate: Int!, endDate: Int!): [Reading]!
  }
  type Stats {
    always_on: Float
    today_so_far: Float
  }
  type Reading {
    timestamp: Int!
    reading: Int!
  }
  type DailySummary {
    timestamp: Int!
    dayUse: Float!
    nightUse: Float!
  }
`);

const resolvers = {
  usageData,
  // เพิ่ม resolver ตัวอื่น ๆ ที่ประกาศ
  realtime,
  stats,
};

module.exports.handler = async (event) => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Request body is empty' }),
      };
    }

    const body = JSON.parse(event.body);

    if (!body.query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'GraphQL query is missing' }),
      };
    }

    const result = await graphql({
  schema: schema,
  source: body.query,
  rootValue: resolvers,
  variableValues: body.variables || {}
});

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message,
      }),
    };
  }
};
