import { runValidation } from './validator';

async function main() {
  const arg = process.argv[2];

  if (arg === 'validate') {
    await runValidation();
  } else {
    console.log('Usage:');
    console.log('  npx tsx src/cli.ts validate     - Run rule validation');
    console.log('  npx tsx src/generate-visualiser.ts - Generate HTML visualiser');
  }
}

main().catch(console.error);
