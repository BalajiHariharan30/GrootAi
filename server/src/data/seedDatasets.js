export const sampleEnterpriseDatasets = [
  {
    name: "Enterprise Customer 360 CRM",
    description: "Global enterprise customer master data containing contact info, company tier, tax IDs, and order lifetime value. Planted with real-world format mismatches, duplicate entries, and null defects.",
    sourceType: "demo",
    records: [
      {
        customerId: "CUST-1001",
        fullName: "Alexander Hamilton",
        email: "a.hamilton@treasury-corp.com",
        phone: "+1-212-555-0199",
        company: "Treasury Corp",
        country: "USA",
        taxId: "TX-99201-US",
        lifetimeValue: 145200.50,
        accountStatus: "active",
        createdAt: "2023-01-15"
      },
      {
        customerId: "CUST-1002",
        fullName: "Alex Hamilton", // Potential Duplicate of CUST-1001
        email: "a.hamilton@treasury-corp.com",
        phone: "2125550199", // unformatted
        company: "Treasury Corporation",
        country: "USA",
        taxId: "TX-99201-US",
        lifetimeValue: 145200.50,
        accountStatus: "active",
        createdAt: "2023-03-22"
      },
      {
        customerId: "CUST-1003",
        fullName: "Elena Rostova",
        email: "elena.rostova@novagroup.io",
        phone: "+44-20-7946-0922",
        company: "Nova Group",
        country: "UK",
        taxId: "GB-88392-UK",
        lifetimeValue: 89400.00,
        accountStatus: "active",
        createdAt: "2023-02-10"
      },
      {
        customerId: "CUST-1004",
        fullName: "Marcus Vance",
        email: "marcus.vance@@zenithlogistics..com", // Malformed email syntax
        phone: "+1-312-555-0144",
        company: "Zenith Logistics",
        country: "USA",
        taxId: "TX-44102-US",
        lifetimeValue: 23100.00,
        accountStatus: "active",
        createdAt: "2023-04-05"
      },
      {
        customerId: "CUST-1005",
        fullName: "Priya Sharma",
        email: "priya.sharma@indotech.in",
        phone: "+91-98200-12345",
        company: "IndoTech Solutions",
        country: "India",
        taxId: "IN-29AAACI1234A1Z5",
        lifetimeValue: 310500.75,
        accountStatus: "active",
        createdAt: "2023-01-30"
      },
      {
        customerId: "CUST-1006",
        fullName: "Priya Sharma", // Duplicate of CUST-1005 with slight variation
        email: "priya.sharma@indotech.in",
        phone: "9820012345",
        company: "Indo Tech Ltd",
        country: "India",
        taxId: "IN-29AAACI1234A1Z5",
        lifetimeValue: 310500.75,
        accountStatus: "active",
        createdAt: "2023-06-12"
      },
      {
        customerId: "CUST-1007",
        fullName: "David K. Miller",
        email: "dmiller@vanguard-cap.org",
        phone: "N/A", // Invalid phone string placeholder
        company: "Vanguard Capital",
        country: null, // Null defect
        taxId: "TX-77301-US",
        lifetimeValue: -4500.00, // Invalid negative LTV violation
        accountStatus: "suspended",
        createdAt: "2023-05-18"
      },
      {
        customerId: "CUST-1008",
        fullName: "Sophie Dubois",
        email: "sophie.dubois@luxeparis.fr",
        phone: "+33-1-4268-5500",
        company: "Luxe Paris SA",
        country: "France",
        taxId: "FR-33991-EU",
        lifetimeValue: 74200.00,
        accountStatus: "active",
        createdAt: "2023-03-01"
      },
      {
        customerId: "CUST-1009",
        fullName: "Kenji Sato",
        email: "kenji.sato@tokyocyber.jp",
        phone: "+81-3-5555-0188",
        company: "Tokyo Cyber Dynamics",
        country: "Japan",
        taxId: "JP-10928-TYO",
        lifetimeValue: 520000.00,
        accountStatus: "active",
        createdAt: "2023-02-14"
      },
      {
        customerId: "CUST-1010",
        fullName: "Chloe Zhang",
        email: "chloe.zhang@apexcloud.sg",
        phone: "+65-6789-0123",
        company: "Apex Cloud SG",
        country: "Singapore",
        taxId: "SG-20193-AP",
        lifetimeValue: 9800000.00, // Outlier statistical anomaly
        accountStatus: "active",
        createdAt: "2023-07-01"
      },
      {
        customerId: "CUST-1011",
        fullName: "Carlos Mendoza",
        email: "carlos.mendoza@solarenergy.mx",
        phone: "+52-55-5555-1234",
        company: "Solar Energy MX",
        country: "Mexico",
        taxId: null, // Missing mandatory taxId
        lifetimeValue: 62000.00,
        accountStatus: "pending_verification",
        createdAt: "2023-04-20"
      },
      {
        customerId: "CUST-1012",
        fullName: "Amira Al-Mansoor",
        email: "amira@gulfinvest.ae",
        phone: "+971-4-321-0000",
        company: "Gulf Investment Group",
        country: "UAE",
        taxId: "AE-77102-DUB",
        lifetimeValue: 420100.00,
        accountStatus: "active",
        createdAt: "2023-05-11"
      }
    ]
  },
  {
    name: "Global E-Commerce Order Stream",
    description: "High-throughput transaction and order fulfillment stream with currency consistency issues, shipping address anomalies, and discount code bounds violations.",
    sourceType: "demo",
    records: [
      {
        orderId: "ORD-90201",
        customerEmail: "sarah.connor@skyreach.com",
        currency: "USD",
        subtotal: 349.99,
        discountPercent: 15.0,
        taxAmount: 28.00,
        totalAmount: 325.49,
        shippingCountry: "USA",
        postalCode: "90210",
        deliveryStatus: "delivered"
      },
      {
        orderId: "ORD-90202",
        customerEmail: "john.wick@continental.it",
        currency: "EUR",
        subtotal: 1250.00,
        discountPercent: 0.0,
        taxAmount: 250.00,
        totalAmount: 1500.00,
        shippingCountry: "Italy",
        postalCode: "00185",
        deliveryStatus: "shipped"
      },
      {
        orderId: "ORD-90203",
        customerEmail: "invalid-email-format-xyz", // Syntax violation
        currency: "USD",
        subtotal: 89.00,
        discountPercent: 120.0, // Impossible discount > 100%
        taxAmount: 0.00,
        totalAmount: -17.80, // Negative charge anomaly
        shippingCountry: "USA",
        postalCode: "10001",
        deliveryStatus: "processing"
      },
      {
        orderId: "ORD-90204",
        customerEmail: "clara.oswald@tardis-consulting.uk",
        currency: "GBP",
        subtotal: 540.00,
        discountPercent: 10.0,
        taxAmount: 108.00,
        totalAmount: 594.00,
        shippingCountry: "UK",
        postalCode: "SW1A 1AA",
        deliveryStatus: "delivered"
      },
      {
        orderId: "ORD-90205",
        customerEmail: "liam.neeson@taken-sec.com",
        currency: "USD",
        subtotal: 2100.00,
        discountPercent: 5.0,
        taxAmount: 168.00,
        totalAmount: 2163.00,
        shippingCountry: "USA",
        postalCode: null, // Null postal code
        deliveryStatus: "out_for_delivery"
      },
      {
        orderId: "ORD-90206",
        customerEmail: "clara.oswald@tardis-consulting.uk", // Duplicate order submitted within 2 seconds
        currency: "GBP",
        subtotal: 540.00,
        discountPercent: 10.0,
        taxAmount: 108.00,
        totalAmount: 594.00,
        shippingCountry: "UK",
        postalCode: "SW1A 1AA",
        deliveryStatus: "processing"
      }
    ]
  }
];
