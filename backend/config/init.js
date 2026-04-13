const sql = require("mssql");

async function initDB(pool) {
    if (!pool) return;
    console.log("🔄 Running schema check and initialization...");
    try {
        // 1. Table: SettlementItemDetail
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[SettlementItemDetail](
                    [ID] [int] IDENTITY(1,1) NOT NULL,
                    [SettlementID] [uniqueidentifier] NULL,
                    [DishName] [nvarchar](255) NULL,
                    [Qty] [int] NULL,
                    [Price] [decimal](18, 2) NULL
                ) ON [PRIMARY]
            END
        `);

        // 2. Table: MemberMaster
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[MemberMaster](
                    [MemberId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
                    [Name] [nvarchar](255) NOT NULL,
                    [Phone] [nvarchar](50) NULL,
                    [Email] [nvarchar](255) NULL,
                    [Balance] [decimal](18, 2) DEFAULT 0,
                    [CreditLimit] [decimal](18, 2) DEFAULT 0,
                    [CurrentBalance] [decimal](18, 2) DEFAULT 0,
                    [CreatedOn] [datetime] DEFAULT GETDATE()
                )
            END
        `);

        // 3. Table: DailyAttendance
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DailyAttendance]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[DailyAttendance](
                    [AttendanceId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
                    [DeliveryPersonId] [uniqueidentifier] NULL,
                    [EmployeeName] [nvarchar](255) NULL,
                    [StartDateTime] [datetime] NULL,
                    [EndDateTime] [datetime] NULL,
                    [BreakInTime] [datetime] NULL,
                    [BreakOutTime] [datetime] NULL,
                    [NoofHours] [decimal](18, 2) NULL,
                    [NoofTrips] [int] NULL,
                    [TotalAmount] [decimal](18, 2) NULL,
                    [IsPaid] [bit] NULL,
                    [BusinessUnitId] [uniqueidentifier] NULL,
                    [CreatedBy] [uniqueidentifier] NULL,
                    [CreatedOn] [datetime] NULL DEFAULT GETDATE()
                )
            END
        `);

        // 4. Schema updates for TableMaster
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'IsLocked')
            ALTER TABLE [dbo].[TableMaster] ADD IsLocked BIT DEFAULT 0;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'LockedByName')
            ALTER TABLE [dbo].[TableMaster] ADD LockedByName NVARCHAR(100);

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'TableNumber')
            ALTER TABLE [dbo].[TableMaster] ADD TableNumber NVARCHAR(50);
        `);

        // 5. Schema updates for SettlementHeader
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'BillNo')
            ALTER TABLE [dbo].[SettlementHeader] ADD BillNo NVARCHAR(50);

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'IsCancelled')
            ALTER TABLE [dbo].[SettlementHeader] ADD IsCancelled BIT DEFAULT 0;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancellationReason')
            ALTER TABLE [dbo].[SettlementHeader] ADD CancellationReason NVARCHAR(255);
        `);

        console.log("✅ Database schema is up to date.");
    } catch (err) {
        console.error("❌ initDB ERROR:", err.message);
    }
}

module.exports = { initDB };
