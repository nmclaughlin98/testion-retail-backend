import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync } from "fs";

const tableName = process.env.TABLE_NAME || "TestionRetail";
const client = new DynamoDBClient({ region: process.env.AWS_REGION || "eu-west-1" });
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
});

// Load the raw exported JSON file
const rawExport = JSON.parse(readFileSync("./exported-data.json", "utf-8"));

function toBool(val) {
    if (typeof val === "boolean") return val;
    if (!val || val === "-") return false;
    return val.toString().toLowerCase() === "yes" || val.toString().toLowerCase() === "true";
}

function transformData(data) {
    const items = [];
    const employeeMap = new Map();

    // 1. Process Base Employee Records
    (data.Employee || []).forEach((emp) => {
        const payrollNo = emp.PayrollNo;
        employeeMap.set(payrollNo, {
            PK: `EMP#${payrollNo}`,
            SK: "METADATA",
            GSI1PK: `POSITION#${emp.Position || "UNKNOWN"}`,
            GSI1SK: `EMP#${payrollNo}`,
            entityType: "Employee",
            payrollNo,
            personalDetails: {
                title: emp.Title !== "-" ? emp.Title : null,
                firstName: emp.FirstName,
                surname: emp.Surname !== "-" ? emp.Surname : null,
                position: emp.Position !== "-" ? emp.Position : null,
                dob: emp.DOB !== "-" ? emp.DOB : null,
                email: emp.EmailAddress !== "-" ? emp.EmailAddress : null,
                phone: emp.PhoneNumber !== "-" ? emp.PhoneNumber : null,
                alternateNumber: emp.AlternateNumber !== "-" ? emp.AlternateNumber : null,
            },
            address: {
                line1: emp.AddressLine1 !== "-" ? emp.AddressLine1 : null,
                line2: emp.AddressLine2 !== "-" ? emp.AddressLine2 : null,
                city: emp.City !== "-" ? emp.City : null,
                postcode: emp.Postcode !== "-" ? emp.Postcode : null,
                county: emp.County !== "-" ? emp.County : null,
            },
            employment: {
                contractType: emp.ContractType !== "-" ? emp.ContractType : null,
                dateJoined: emp.DateJoined,
            }
        });
    });

    // 2. Merge Payroll
    (data.Payroll || []).forEach((p) => {
        const emp = employeeMap.get(p.PayrollNo);
        if (emp) {
            emp.payroll = {
                rate: p.Rate !== "n/a" ? p.Rate : null,
                salary: p.Salary !== "n/a" ? p.Salary : null,
                accountNumber: p.AccountNumber,
                sortCode: p.SortCode,
            };
        }
    });

    // 3. Merge Tillpoint Users & PINs
    (data.TillpointUsers || []).forEach((u) => {
        const emp = employeeMap.get(u.PayrollNo);
        if (emp) {
            emp.tillUser = {
                activeUser: toBool(u.ActiveUser),
                pinNumber: u.PinNumber !== "-" && u.PinNumber !== "" ? u.PinNumber : null,
            };
            if (u.PinNumber && u.PinNumber !== "-") {
                emp.GSI1PK = `PIN#${u.PinNumber}`;
            }
        }
    });

    // 4. Merge Permissions
    (data.TillpointPermissions || []).forEach((perm) => {
        const emp = employeeMap.get(perm.PayrollNo);
        if (emp) {
            emp.permissions = {
                returns: toBool(perm.Returns),
                orders: toBool(perm.Orders),
                staffDiscount: toBool(perm.StaffDiscount),
                priceAdjustment: toBool(perm.PriceAdjustment),
                uniform: toBool(perm.Uniform),
                income: toBool(perm.Income),
                tillLift: toBool(perm.TillLift),
                override: toBool(perm.Override),
            };
        }
    });

    // 5. Merge User Settings
    (data.UserSettings || []).forEach((setting) => {
        const emp = employeeMap.get(setting.PayrollNo);
        if (emp) {
            emp.settings = {
                datePreference: setting.DatePreference,
                timePreference: setting.TimePreference,
                colourScheme: setting.ColourScheme,
                defaultSystem: setting.DefaultSystem,
                noNotifications: toBool(setting.NoNotifications),
            };
        }
    });

    // Add consolidated Employee items
    items.push(...employeeMap.values());

    // 6. Process Tillpoint Setups
    (data.TillpointSetup || []).forEach((till) => {
        items.push({
            PK: `TILL#${till.TillNo}`,
            SK: "SETUP",
            GSI1PK: `DEPT#${till.Department}`,
            GSI1SK: `TILL#${till.TillNo}`,
            entityType: "TillSetup",
            tillNo: till.TillNo,
            department: till.Department,
            status: till.Status,
            version: till.Version,
            saleOn: toBool(till.SaleOn),
            tillOn: toBool(till.TillOn),
        });
    });

    // 7. Process User Logins
    (data.UserLogin || []).forEach((login, idx) => {
        const loginTimestamp = `${login.DateLogin.split('T')[0]}T${login.TimeLogin.split('T')[1] || '00:00:00.000'}`;
        items.push({
            PK: `EMP#${login.PayrollNo}`,
            SK: `LOG#${loginTimestamp}#${idx}`,
            GSI1PK: "LOGINS",
            GSI1SK: `${login.DateLogin}#${login.PayrollNo}`,
            entityType: "UserLogin",
            payrollNo: login.PayrollNo,
            dateLogin: login.DateLogin,
            timeLogin: login.TimeLogin,
        });
    });

    return items;
}

async function seed() {
    const transformedItems = transformData(rawExport);
    console.log(`📦 Transformed ${transformedItems.length} combined items for DynamoDB.`);

    const putRequests = transformedItems.map((item) => ({
        PutRequest: { Item: item },
    }));

    // Batch Write in chunks of 25 items
    const chunkSize = 25;
    for (let i = 0; i < putRequests.length; i += chunkSize) {
        const chunk = putRequests.slice(i, i + chunkSize);
        await docClient.send(
            new BatchWriteCommand({
                RequestItems: { [tableName]: chunk },
            })
        );
        console.log(`Uploaded batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(putRequests.length / chunkSize)}`);
    }

    console.log("Seeding complete!");
}

seed().catch(console.error);
