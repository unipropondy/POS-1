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
                    [DishId] [uniqueidentifier] NULL,
                    [DishGroupId] [uniqueidentifier] NULL,
                    [SubCategoryId] [uniqueidentifier] NULL,
                    [CategoryId] [uniqueidentifier] NULL,
                    [DishName] [nvarchar](255) NULL,
                    [Qty] [int] NULL,
                    [Price] [decimal](18, 2) NULL,
                    [OrderDateTime] [datetime] NULL
                ) ON [PRIMARY]
            END

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'DishId')
            ALTER TABLE [dbo].[SettlementItemDetail] ADD DishId UNIQUEIDENTIFIER NULL;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'DishGroupId')
            ALTER TABLE [dbo].[SettlementItemDetail] ADD DishGroupId UNIQUEIDENTIFIER NULL;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'SubCategoryId')
            ALTER TABLE [dbo].[SettlementItemDetail] ADD SubCategoryId UNIQUEIDENTIFIER NULL;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'CategoryId')
            ALTER TABLE [dbo].[SettlementItemDetail] ADD CategoryId UNIQUEIDENTIFIER NULL;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'OrderDateTime')
            ALTER TABLE [dbo].[SettlementItemDetail] ADD OrderDateTime DATETIME NULL;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'CategoryName')
            ALTER TABLE [dbo].[SettlementItemDetail] ADD CategoryName NVARCHAR(255) NULL;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'SubCategoryName')
            ALTER TABLE [dbo].[SettlementItemDetail] ADD SubCategoryName NVARCHAR(255) NULL;
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

    // 6. Table: CartItems (Persistence)
    await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[CartItems](
                    [ItemId] [nvarchar](128) NOT NULL PRIMARY KEY,
                    [CartId] [nvarchar](max) NULL,
                    [ProductId] [nvarchar](128) NULL,
                    [Quantity] [int] NULL,
                    [Cost] [decimal](18, 2) NULL,
                    [OrderNo] [nvarchar](max) NULL,
                    [OrderConfirmQty] [int] NULL,
                    [DateCreated] [datetime] DEFAULT GETDATE()
                )
            END

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'IsTakeaway')
            ALTER TABLE [dbo].[CartItems] ADD IsTakeaway BIT DEFAULT 0;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'IsVoided')
            ALTER TABLE [dbo].[CartItems] ADD IsVoided BIT DEFAULT 0;

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'Note')
            ALTER TABLE [dbo].[CartItems] ADD Note NVARCHAR(MAX);

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'ModifiersJSON')
            ALTER TABLE [dbo].[CartItems] ADD ModifiersJSON NVARCHAR(MAX);

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'Spicy')
            ALTER TABLE [dbo].[CartItems] ADD Spicy NVARCHAR(50);

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'Salt')
            ALTER TABLE [dbo].[CartItems] ADD Salt NVARCHAR(50);

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'Oil')
            ALTER TABLE [dbo].[CartItems] ADD Oil NVARCHAR(50);

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'Sugar')
            ALTER TABLE [dbo].[CartItems] ADD Sugar NVARCHAR(50);

            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND name = 'Status')
            ALTER TABLE [dbo].[CartItems] ADD Status NVARCHAR(20) DEFAULT 'NEW';
        `);

    // 7. Table: AppSettings (UPI, PayNow, Shop Info)
    await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[AppSettings](
                    [Id] [int] IDENTITY(1,1) PRIMARY KEY,
                    [UPI_ID] [nvarchar](255) NULL,
                    [PayNow_QR_Url] [nvarchar](max) NULL,
                    [ShopName] [nvarchar](255) NULL,
                    [UpdatedOn] [datetime] DEFAULT GETDATE()
                );
                
                -- Insert a default row if it doesn't exist
                INSERT INTO [dbo].[AppSettings] (UPI_ID, ShopName)
                VALUES (NULL, 'My Restaurant');
            END
        `);

    console.log("✅ Database schema is up to date.");
  } catch (err) {
    console.error("❌ initDB ERROR:", err.message);
  }
}

module.exports = { initDB };
