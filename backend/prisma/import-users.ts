import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Employee roster from image ───────────────────────────────────────────────
// Password for each user: imperative@<empId>  (e.g. imperative@40027)
const employees = [
  { srNo: 1,  empId: '40027', name: 'Sanjana Santosh Kadam',         email: 'Sanjana.k@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 2,  empId: '40028', name: 'Sham Narayan Gehlot',           email: 'Sham.g@theimperative.in',      designation: 'Executive',    location: 'Pune' },
  { srNo: 3,  empId: '40029', name: 'Atharva Rajendra Jadhav',       email: 'Atharva.j@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 4,  empId: '40030', name: 'Sai Gorakhnath Mundhare',       email: 'Sai.m@theimperative.in',       designation: 'Executive',    location: 'Pune' },
  { srNo: 5,  empId: '40031', name: 'Raj Santosh Kshirsagar',        email: 'Raj.k@theimperative.in',       designation: 'Executive',    location: 'Pune' },
  { srNo: 6,  empId: '40032', name: 'Pratik Krishnarao More',        email: 'Pratik.m@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 7,  empId: '40034', name: 'Sharad Anil Sakat',             email: 'Sharad.s@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 8,  empId: '40035', name: 'Priya Nilesh Raut',             email: 'Priya.r@theimperative.in',     designation: 'Executive',    location: 'Pune' },
  { srNo: 9,  empId: '40036', name: 'Siddhesh Dattatray Mirje',      email: 'Siddhesh.m@theimperative.in',  designation: 'Executive',    location: 'Pune' },
  { srNo: 10, empId: '40037', name: 'Ruturaj Sunil Abitkar',         email: 'Ruturaj.a@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 11, empId: '40038', name: 'Asif Dastgir Shaikh',           email: 'Asif.s@theimperative.in',      designation: 'Executive',    location: 'Pune' },
  { srNo: 12, empId: '40039', name: 'Sidhi Santosh Madne',           email: 'Sidhi.m@theimperative.in',     designation: 'Executive',    location: 'Pune' },
  { srNo: 13, empId: '40040', name: 'Rupesh Kumar Choudhary',        email: 'Rupesh.c@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 14, empId: '40042', name: 'Ritik Vishnu Jadhav',           email: 'Ritik.j@theimperative.in',     designation: 'Executive',    location: 'Pune' },
  { srNo: 15, empId: '40044', name: 'Rohini Raghunath Kshirsagar',   email: 'Rohini.k@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 16, empId: '40045', name: 'Sanchita Shankar Nanavare',     email: 'Sanchita.n@theimperative.in',  designation: 'Executive',    location: 'Pune' },
  { srNo: 17, empId: '40047', name: 'Ankita Bibishan Gund',          email: 'Ankita.g@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 18, empId: '40048', name: 'Reshma Gulabrao Adhe',          email: 'Reshma.a@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 19, empId: '40050', name: 'Alisha Iqbal Peerzade',         email: 'Alisha.p@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 20, empId: '40051', name: 'Dipak Rajendra Bhendekar',      email: 'Dipak.b@theimperative.in',     designation: 'Executive',    location: 'Pune' },
  { srNo: 21, empId: '40055', name: 'Nikhil Sanjay Mehendale',       email: 'Nikhil.m@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 22, empId: '40058', name: 'Gopal Omprakash Lohiya',        email: 'Gopal.l@theimperative.in',     designation: 'Executive',    location: 'Pune' },
  { srNo: 23, empId: '40059', name: 'Ram Mahadu Kamble',             email: 'Ram.k@theimperative.in',       designation: 'Executive',    location: 'Pune' },
  { srNo: 24, empId: '40061', name: 'S. Jagadish',                   email: 'Jagadish.s@theimperative.in',  designation: 'Executive',    location: 'Pune' },
  { srNo: 25, empId: '40062', name: 'Akash Ravsaheb Vitkar',         email: 'Akash.v@theimperative.in',     designation: 'Executive',    location: 'Pune' },
  { srNo: 26, empId: '40064', name: 'Shradha Gajanan Jadhav',        email: 'Shradha.j@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 27, empId: '40065', name: 'Kishan Dnyanoba Murkute',       email: 'Kishan.m@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 28, empId: '40066', name: 'Akanksha Shivaji Kedar',        email: 'Akanksha.k@theimperative.in',  designation: 'Executive',    location: 'Pune' },
  { srNo: 29, empId: '40067', name: 'Supriya Prakash Patil',         email: 'Supriya.p@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 30, empId: '40068', name: 'Suraj Manoj Bhosale',           email: 'Suraj.b@theimperative.in',     designation: 'Executive',    location: 'Pune' },
  { srNo: 31, empId: '40070', name: 'Nandani Chandrakant Kalyankar', email: 'Nandani.k@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 32, empId: '40071', name: 'Siddhi Suresh Raut',            email: 'Siddhi.r@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 33, empId: '40072', name: 'Deepak Chandan Yadav',          email: 'Deepak.y@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 34, empId: '40073', name: 'Shivakanya Shivaraj Pandagale', email: 'Shivakanya.p@theimperative.in', designation: 'Executive',   location: 'Pune' },
  { srNo: 35, empId: '40075', name: 'Akshay Ashok Kharat',           email: 'Akshay.k@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 36, empId: '40076', name: 'Shubham Mahendra Kamble',       email: 'Shubham.k@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 37, empId: '40077', name: 'Rushikesh Raju Boddu',          email: 'Rushikesh.b@theimperative.in', designation: 'Executive',    location: 'Pune' },
  { srNo: 38, empId: '40080', name: 'Anjali Bapu Gondkar',           email: 'Anjali.g@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 39, empId: '40082', name: 'Shradha Ashok Birajdar',        email: 'Shradha.b@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 40, empId: '40086', name: 'Snehal Pandurang Pawar',        email: 'Snehal.p@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 41, empId: '40087', name: 'Karan Gangadhar Shinde',        email: 'Karan.s@theimperative.in',     designation: 'Executive',    location: 'Pune' },
  { srNo: 42, empId: '40094', name: 'Sakshi Dilip Shinde',           email: 'Sakshi.s@theimperative.in',    designation: 'Executive',    location: 'Pune' },
  { srNo: 43, empId: '40095', name: 'Shabana Nafis Pathan',          email: 'Shabana.p@theimperative.in',   designation: 'Executive',    location: 'Pune' },
  { srNo: 44, empId: '40053', name: 'Dhirendra Bhadoriya',           email: 'dhirendra.b@theimperative.in', designation: 'Team Leader', location: 'Pune' },
  { srNo: 45, empId: '40054', name: 'Manoj Gujar',                   email: 'manoj.g@theimperative.in',     designation: 'Team Leader', location: 'Pune' },
  { srNo: 46, empId: '50011', name: 'Hemalatha G',                   email: 'hemalatha.g1@theimperative.in', designation: 'Team Leader', location: 'Chennai' },
];

async function main() {
  console.log('🔍 Looking up existing workspace...');

  // Find the first active workspace to add users into
  const workspace = await prisma.workspace.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!workspace) {
    throw new Error('❌ No active workspace found. Please run the seed first.');
  }

  console.log(`✅ Found workspace: "${workspace.name}" (${workspace.id})\n`);
  console.log(`📋 Importing ${employees.length} employees...`);
  console.log('─────────────────────────────────────────────────────────────');

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const emp of employees) {
    const password = `imperative@${emp.empId}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const emailLower = emp.email.toLowerCase();

    // Determine workspace role
    const role = emp.designation === 'Team Leader' ? 'MANAGER' : 'MEMBER';
    const department = emp.designation;

    try {
      // Check if user already exists (by email)
      const existing = await prisma.user.findUnique({
        where: { email: emailLower },
      });

      if (existing) {
        console.log(`  ⏭️  SKIP  #${emp.srNo.toString().padStart(2)} ${emp.name} (${emailLower}) — already exists`);
        skipped++;
        continue;
      }

      // Create the user with profile and workspace membership
      await prisma.user.create({
        data: {
          email: emailLower,
          passwordHash,
          profile: {
            create: {
              displayName: emp.name,
              aboutText: `${emp.designation} — ${emp.location}`,
              statusAvailability: 'ACTIVE',
            },
          },
          workspaceUsers: {
            create: {
              workspaceId: workspace.id,
              role,
              department,
              isActive: true,
            },
          },
        },
      });

      console.log(`  ✅ #${emp.srNo.toString().padStart(2)} ${emp.name.padEnd(35)} ${emailLower.padEnd(40)} pw: ${password}`);
      created++;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error(`  ❌ #${emp.srNo.toString().padStart(2)} ${emp.name} — ERROR: ${msg}`);
      errors.push(`${emp.name}: ${msg}`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`🎉 Import complete!`);
  console.log(`   ✅ Created : ${created}`);
  console.log(`   ⏭️  Skipped : ${skipped} (already existed)`);
  console.log(`   ❌ Errors  : ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nFailed entries:');
    errors.forEach((e) => console.log(`  - ${e}`));
  }

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Password format: imperative@<EmpID>');
  console.log('Examples:');
  console.log('  Sanjana Santosh Kadam  → imperative@40027');
  console.log('  Manoj Gujar            → imperative@40054');
  console.log('  Hemalatha G            → imperative@50011');
  console.log('─────────────────────────────────────────────────────────────');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
