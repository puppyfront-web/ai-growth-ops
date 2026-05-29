import { getDeliveryDoctorReport } from '../apps/runtime-core/src/tools/delivery-tools.js';

async function main() {
  const report = await getDeliveryDoctorReport();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
