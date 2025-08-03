const { getUsageDataFromDynamoDB } = require('../../../core/helpers');
const { config } = require('../../../core/config');

module.exports.usageData = async ({ startDate, endDate }) => {

  // 🔍 Log ค่าที่รับเข้ามา
  console.log(">>> usageData called with:");
  console.log("startDate:", startDate);
  console.log("endDate:", endDate);

  // Fetch the data from DynamoDB
  const data = await getUsageDataFromDynamoDB(
    config.deviceName, startDate, endDate
  );

  // 🔍 Log ข้อมูลที่ได้จาก DynamoDB
  console.log("Fetched data count:", data.length);
  console.log("Sample data:", JSON.stringify(data.slice(0, 3), null, 2)); // แสดงตัวอย่างแค่ 3 รายการ

  // Transform the usage data to a format that GraphQL expects
  return data.map(el => {
    return {
      timestamp: el.sortkey,
      dayUse: el.usage.day,
      nightUse: el.usage.night,
    }
  });
}
