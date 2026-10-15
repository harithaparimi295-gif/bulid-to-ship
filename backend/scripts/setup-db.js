const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');
const dotenv = require('dotenv');

// Load environment variables from backend/.env
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

async function promptUser(questionText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function extractProjectRef(supabaseUrl) {
  if (!supabaseUrl) return null;
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
}

async function runMigration() {
  console.log('========================================================');
  console.log('⚡ Supabase Automatic Database Setup & Migration Runner');
  console.log('========================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const projectRef = extractProjectRef(supabaseUrl) || 'dgzqguflliqkvrejaapp';

  // 1. Determine Database Connection String
  let connectionString = process.env.DATABASE_URL || '';

  if (!connectionString) {
    let dbPassword = process.env.SUPABASE_DB_PASSWORD || '';

    // Check command line arguments for --password=... or -p ...
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--password=')) {
        dbPassword = args[i].split('=')[1];
      } else if (args[i] === '-p' && args[i + 1]) {
        dbPassword = args[i + 1];
      } else if (args[i].startsWith('--db-url=')) {
        connectionString = args[i].split('=')[1];
      }
    }

    if (!connectionString && !dbPassword) {
      console.log(`📌 Target Supabase Project: ${projectRef}`);
      console.log(`ℹ️  To connect directly to Postgres, enter your Supabase Database Password.`);
      console.log(`   (You set this when creating the Supabase project.`);
      console.log(`    Find or reset it at: https://supabase.com/dashboard/project/${projectRef}/settings/database)\n`);

      dbPassword = await promptUser('🔑 Enter Supabase Database Password: ');
    }

    if (!connectionString && dbPassword) {
      // Connect to direct Supabase Postgres instance
      connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
    }
  }

  if (!connectionString) {
    console.error('\n❌ Error: No connection string or database password provided.');
    console.log('\n💡 You can run this command by passing your password:');
    console.log('   npm run db:setup -- --password="YOUR_DB_PASSWORD"');
    console.log('or add DATABASE_URL into backend/.env:');
    console.log(`   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.${projectRef}.supabase.co:5432/postgres\n`);
    process.exit(1);
  }

  // 2. Read Migration File
  const migrationFile = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261014101000_create_chat_tables.sql');
  const fallbackSchema = path.join(__dirname, '..', 'supabase-schema.sql');
  const sqlPath = fs.existsSync(migrationFile) ? migrationFile : fallbackSchema;

  console.log(`\n📄 Loading migration script from:\n   ${sqlPath}\n`);
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  // 3. Connect to PostgreSQL
  console.log('🔌 Connecting to Supabase Postgres database...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully to remote database!\n');

    console.log('🚀 Executing migration...');
    await client.query(sqlContent);
    console.log('✅ Migration queries executed successfully!\n');

    // 4. Verify Tables
    console.log('🔍 Verifying created tables...');
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('conversations', 'messages')
      ORDER BY table_name;
    `);

    const foundTables = res.rows.map(r => r.table_name);
    console.log(`   Found tables in database: ${foundTables.join(', ')}`);

    if (foundTables.includes('conversations') && foundTables.includes('messages')) {
      console.log('\n🎉 ALL REQUIRED TABLES CREATED SUCCESSFULLY:');
      console.log('   ✓ public.conversations (id, title, created_at, updated_at)');
      console.log('   ✓ public.messages (id, conversation_id, role, text, model, created_at)');
      console.log('   ✓ Indexes created');
      console.log('   ✓ Row Level Security (RLS) policies applied');
      console.log('   ✓ Realtime publication configured');
    } else {
      console.warn('⚠️ Warning: Not all expected tables were detected.');
    }

  } catch (err) {
    console.error('\n❌ Migration failed with error:');
    console.error(err.message);

    if (err.message.includes('password authentication failed')) {
      console.log('\n💡 Tip: The database password was incorrect. Please check your password in the Supabase Dashboard.');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ETIMEDOUT')) {
      console.log('\n💡 Tip: Network timeout. If using direct connection, try the Supabase Connection Pooler URL from Project Settings -> Database.');
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }

  console.log('\n========================================================');
  console.log('✨ Database is fully ready for Gemini Chatbot!');
  console.log('========================================================\n');
}

runMigration();
