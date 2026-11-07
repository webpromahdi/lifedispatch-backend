import bcrypt from "bcryptjs";
import {
  AmbulanceStatus,
  AmbulanceType,
  CertificationLevel,
  UserRole,
  UserStatus,
} from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  console.log("🚑 Starting ambulance and driver fleet seeding...");

  // 1. Get default hospital
  const hospital = await prisma.hospital.findFirst({
    where: { isActive: true },
  });

  const hospitalId = hospital ? hospital.id : null;
  console.log(`🏥 Linked hospital ID: ${hospitalId ?? "None"}`);

  // 2. Hash default driver password
  const defaultPassword = await bcrypt.hash("Driver@123", 10);

  // 3. Update existing Tester Driver (driver@lifedispatch.com) and assign to AMB-1002 (ALS)
  const testerDriverUser = await prisma.user.findFirst({
    where: { email: "driver@lifedispatch.com" },
    include: { driverProfile: true },
  });

  let existingAmb1002 = await prisma.ambulance.findUnique({
    where: { registrationNumber: "AMB-1002" },
  });

  if (!existingAmb1002) {
    existingAmb1002 = await prisma.ambulance.create({
      data: {
        registrationNumber: "AMB-1002",
        type: AmbulanceType.ADVANCED_LIFE_SUPPORT,
        status: AmbulanceStatus.AVAILABLE,
        capabilities: ["ALS", "Ventilator", "Defibrillator", "Oxygen", "ECG", "IV Kit"],
        registrationDocumentUrl: "https://res.cloudinary.com/dhwzxbtdp/raw/upload/v1788958731/lifedispatch/ambulances/demo_ambulance_registration_gmlzmg.pdf",
        hospitalId,
        baseLocationLat: 23.8720, // Uttara Sector 4 (Very close to INC-2026-000003 in Uttara Sector 3)
        baseLocationLng: 90.3850,
        currentLat: 23.8720,
        currentLng: 90.3850,
        lastServiceDate: new Date("2026-01-15"),
        nextServiceDue: new Date("2027-06-30"),
        manufacturedYear: 2023,
      },
    });
  } else {
    existingAmb1002 = await prisma.ambulance.update({
      where: { id: existingAmb1002.id },
      data: {
        status: AmbulanceStatus.AVAILABLE,
        deletedAt: null,
        baseLocationLat: 23.8720,
        baseLocationLng: 90.3850,
        currentLat: 23.8720,
        currentLng: 90.3850,
        capabilities: ["ALS", "Ventilator", "Defibrillator", "Oxygen", "ECG", "IV Kit"],
        nextServiceDue: new Date("2027-06-30"),
      },
    });
  }

  if (testerDriverUser?.driverProfile) {
    await prisma.driver.update({
      where: { id: testerDriverUser.driverProfile.id },
      data: {
        assignedAmbulanceId: existingAmb1002.id,
        isOnShift: true,
        shiftStart: new Date(),
        licenseExpiry: new Date("2032-01-01"),
      },
    });
    console.log(`✅ Assigned AMB-1002 (ALS, Uttara) to Tester Driver (driver@lifedispatch.com) & set On-Shift`);
  }

  // 4. Update existing Mohammad Karim (karim.driver@test.com)
  const karimUser = await prisma.user.findFirst({
    where: { email: "karim.driver@test.com" },
    include: { driverProfile: true },
  });

  let amb1003 = await prisma.ambulance.findUnique({
    where: { registrationNumber: "AMB-1003" },
  });

  if (!amb1003) {
    amb1003 = await prisma.ambulance.create({
      data: {
        registrationNumber: "AMB-1003",
        type: AmbulanceType.ADVANCED_LIFE_SUPPORT,
        status: AmbulanceStatus.AVAILABLE,
        capabilities: ["ALS", "Ventilator", "Defibrillator", "Telemetry", "Suction Unit"],
        registrationDocumentUrl: "https://res.cloudinary.com/dhwzxbtdp/raw/upload/v1788958731/lifedispatch/ambulances/demo_ambulance_registration_gmlzmg.pdf",
        hospitalId,
        baseLocationLat: 23.7925, // Gulshan-2
        baseLocationLng: 90.4078,
        currentLat: 23.7925,
        currentLng: 90.4078,
        lastServiceDate: new Date("2026-02-01"),
        nextServiceDue: new Date("2027-08-30"),
        manufacturedYear: 2024,
      },
    });
  } else {
    amb1003 = await prisma.ambulance.update({
      where: { id: amb1003.id },
      data: {
        status: AmbulanceStatus.AVAILABLE,
        deletedAt: null,
        nextServiceDue: new Date("2027-08-30"),
      },
    });
  }

  if (karimUser?.driverProfile) {
    await prisma.driver.update({
      where: { id: karimUser.driverProfile.id },
      data: {
        assignedAmbulanceId: amb1003.id,
        isOnShift: true,
        shiftStart: new Date(),
        licenseExpiry: new Date("2032-01-01"),
      },
    });
    console.log(`✅ Assigned AMB-1003 (ALS, Gulshan) to Mohammad Karim & set On-Shift`);
  }

  // 5. Seed other ambulance types for remaining priorities/capabilities
  const fleetSpecs = [
    {
      ambulance: {
        registrationNumber: "AMB-2001",
        type: AmbulanceType.BASIC_LIFE_SUPPORT,
        capabilities: ["BLS", "Oxygen Support", "First Aid Kit", "Standard Stretcher", "Splints"],
        baseLocationLat: 23.8069, // Mirpur-10
        baseLocationLng: 90.3687,
        manufacturedYear: 2022,
      },
      driver: {
        name: "Tariqul Islam",
        email: "tariq.driver@lifedispatch.com",
        phone: "+8801711000001",
        licenseNumber: "DL-DHK-2001",
        certificationLevel: CertificationLevel.EMT_BASIC,
      },
    },
    {
      ambulance: {
        registrationNumber: "AMB-2002",
        type: AmbulanceType.BASIC_LIFE_SUPPORT,
        capabilities: ["BLS", "Automated External Defibrillator (AED)", "Oxygen", "Trauma Kit"],
        baseLocationLat: 23.7465, // Dhanmondi
        baseLocationLng: 90.3760,
        manufacturedYear: 2023,
      },
      driver: {
        name: "Abdul Alim",
        email: "alim.driver@lifedispatch.com",
        phone: "+8801711000002",
        licenseNumber: "DL-DHK-2002",
        certificationLevel: CertificationLevel.EMT_ADVANCED,
      },
    },
    {
      ambulance: {
        registrationNumber: "AMB-3001",
        type: AmbulanceType.NEONATAL,
        capabilities: ["NEONATAL", "Infant Transport Incubator", "Pediatric Ventilator", "Neonatal Resuscitation"],
        baseLocationLat: 23.7776, // Mohakhali
        baseLocationLng: 90.4054,
        manufacturedYear: 2024,
      },
      driver: {
        name: "Kamal Hossain",
        email: "kamal.driver@lifedispatch.com",
        phone: "+8801711000003",
        licenseNumber: "DL-DHK-3001",
        certificationLevel: CertificationLevel.PARAMEDIC,
      },
    },
    {
      ambulance: {
        registrationNumber: "AMB-4001",
        type: AmbulanceType.BARIATRIC,
        capabilities: ["BARIATRIC", "Heavy-Duty Powered Stretcher", "Hydraulic Lift", "Extra-Wide Ramp", "Bariatric Transfer Sheet"],
        baseLocationLat: 23.7598, // Tejgaon
        baseLocationLng: 90.3908,
        manufacturedYear: 2023,
      },
      driver: {
        name: "Shamsul Huda",
        email: "shamsul.driver@lifedispatch.com",
        phone: "+8801711000004",
        licenseNumber: "DL-DHK-4001",
        certificationLevel: CertificationLevel.EMT_ADVANCED,
      },
    },
    {
      ambulance: {
        registrationNumber: "AMB-5001",
        type: AmbulanceType.PATIENT_TRANSPORT,
        capabilities: ["Patient Transport", "Wheelchair Ramp", "Basic First Aid", "Pulse Oximeter", "Vital Monitor"],
        baseLocationLat: 23.7937, // Banani
        baseLocationLng: 90.4046,
        manufacturedYear: 2022,
      },
      driver: {
        name: "Nurul Amin",
        email: "nurul.driver@lifedispatch.com",
        phone: "+8801711000005",
        licenseNumber: "DL-DHK-5001",
        certificationLevel: CertificationLevel.EMT_BASIC,
      },
    },
  ];

  for (const item of fleetSpecs) {
    // 1. Create or find driver user
    let user = await prisma.user.findFirst({
      where: { email: item.driver.email },
      include: { driverProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: item.driver.name,
          email: item.driver.email,
          phone: item.driver.phone,
          password: defaultPassword,
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
          isVerified: true,
          mustChangePassword: false,
          driverProfile: {
            create: {
              licenseNumber: item.driver.licenseNumber,
              licenseExpiry: new Date("2032-01-01"),
              licenseDocumentUrl: "https://placeholder.example.com/driver-license.pdf",
              certificationLevel: item.driver.certificationLevel,
              isOnShift: true,
              shiftStart: new Date(),
            },
          },
        },
        include: { driverProfile: true },
      });
      console.log(`Created new Driver: ${item.driver.name} (${item.driver.email})`);
    } else if (user.driverProfile) {
      await prisma.driver.update({
        where: { id: user.driverProfile.id },
        data: {
          isOnShift: true,
          shiftStart: new Date(),
          licenseExpiry: new Date("2032-01-01"),
        },
      });
    }

    // 2. Create or find ambulance
    let amb = await prisma.ambulance.findUnique({
      where: { registrationNumber: item.ambulance.registrationNumber },
    });

    if (!amb) {
      amb = await prisma.ambulance.create({
        data: {
          registrationNumber: item.ambulance.registrationNumber,
          type: item.ambulance.type,
          status: AmbulanceStatus.AVAILABLE,
          capabilities: item.ambulance.capabilities,
          registrationDocumentUrl: "https://res.cloudinary.com/dhwzxbtdp/raw/upload/v1788958731/lifedispatch/ambulances/demo_ambulance_registration_gmlzmg.pdf",
          hospitalId,
          baseLocationLat: item.ambulance.baseLocationLat,
          baseLocationLng: item.ambulance.baseLocationLng,
          currentLat: item.ambulance.baseLocationLat,
          currentLng: item.ambulance.baseLocationLng,
          lastServiceDate: new Date("2026-01-10"),
          nextServiceDue: new Date("2027-06-30"),
          manufacturedYear: item.ambulance.manufacturedYear,
        },
      });
      console.log(`Created Ambulance ${item.ambulance.registrationNumber} (${item.ambulance.type})`);
    } else {
      amb = await prisma.ambulance.update({
        where: { id: amb.id },
        data: {
          status: AmbulanceStatus.AVAILABLE,
          deletedAt: null,
          nextServiceDue: new Date("2027-06-30"),
        },
      });
    }

    // 3. Link driver to ambulance
    if (user.driverProfile) {
      await prisma.driver.update({
        where: { id: user.driverProfile.id },
        data: {
          assignedAmbulanceId: amb.id,
          isOnShift: true,
        },
      });
      console.log(`🔗 Linked ${amb.registrationNumber} to ${item.driver.name}`);
    }
  }

  console.log("🎉 All ambulances and drivers successfully seeded!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

