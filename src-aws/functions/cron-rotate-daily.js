'use strict';
const { dynamoDocClient } = require('../core/aws-connections');
const { config } = require('../core/config');
const { getYesterdayDate, getTodaysDate, writeToS3, writeToDynamoDB, parseDynamoDBItemsToCSV} = require('../core/helpers');
const { calculateKWH } = require('../core/helpers/CalculateKwh');

// เพิ่มการ import QueryCommand สำหรับ AWS SDK v3
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const deviceName = config.deviceName;

/**
 * Fetches all of yesterday's readings of a certain
 * device from DynamoDB.
 */
async function fetchYesterdaysData(){
    const timerLabel = '[PERF] Get history data';
    console.time(timerLabel);

    try{
        const startRange = getYesterdayDate().unixTimestamp;
        const endRange = getTodaysDate().unixTimestamp;
        const prefix = 'reading-' + deviceName;

        // --- แก้ไขส่วนนี้ ---
        // เปลี่ยนจากการใช้ dynamoDocClient.query({...}).promise()
        // มาเป็น dynamoDocClient.send(new QueryCommand({...})) ตามหลักของ AWS SDK v3
        const params = {
            TableName : config.dynamoDb.table,
            KeyConditionExpression: '#key = :key and #sortKey BETWEEN :start AND :end',
            ScanIndexForward: true, // DESC order
            ConsistentRead: false,
            ExpressionAttributeNames:{
                '#key': 'primarykey',
                '#sortKey': 'sortkey',
            },
            ExpressionAttributeValues: {
                ':key': prefix,
                ':start': startRange,
                ':end': endRange,
            },
        };

        const data = await dynamoDocClient.send(new QueryCommand(params));
        // --- จบส่วนที่แก้ไข ---

        console.timeEnd(timerLabel);
        console.log('Item count for yesterday', data.Items.length);
        return data;
    }catch(e){
        console.log('Error fetching historical data');
        console.log(e);

        // To prevent the application from crashing completely, we
        // return an valid DynamoDB result object with no entries.
        return { Items: [] };
    }
}


function calculateKwhSummary(csvData){
    // Transform the data
    const measurements = [];

    for(const line of csvData.split('\n')){
        if(line === '') continue;

        const parts = line.split(',');

        if(parts[0] === 'Timestamp') continue;

        measurements.push(
            [new Date(parseInt(parts[0]) * 1000), parseInt(parts[1])]
        );
    }

    // Calculate the usage
    return calculateKWH(measurements);
}

async function writeUsageToDynamoDB(usageObj){
    const timerLabel = '[PERF] Write daily summary to DynamoDB';
    console.time(timerLabel);

    try{
        const key = 'summary-day-' + deviceName;
        const sortkey = getYesterdayDate().unixTimestamp;

        // ฟังก์ชันนี้เรียกใช้ writeToDynamoDB จาก helpers
        // ซึ่งเราได้แก้ไขให้ถูกต้องแล้วในขั้นตอนก่อนหน้า
        const data = await writeToDynamoDB(config.dynamoDb.table, {
            primarykey: key,
            sortkey: sortkey,
            usage: usageObj
        });

        console.timeEnd(timerLabel);
        return data;
    }catch(e){
        console.log('Error writing daily usage to DynamoDB:');
        console.log(e);

        // To prevent the application from crashing completely, we
        // return an valid DynamoDB result object with no entries.
        return false
    }
}

module.exports.handler = async(event, context, callback) => {
    const data = await fetchYesterdaysData();

    // Convert to CSV
    const csv = parseDynamoDBItemsToCSV(data);

    const time = getYesterdayDate();

    // Write to S3
    await writeToS3(`archived-readings/${deviceName}/${time.year}/${time.month}/${time.string}.csv`, csv);

    // Calculate the kWh consumed & write it to DynamoDB
    const usageData = calculateKwhSummary(csv);
    console.log('usage data', usageData);
    await writeUsageToDynamoDB(usageData);
};
