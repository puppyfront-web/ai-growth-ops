import { Job } from 'bullmq';
import {
  createDatabaseClient,
  generateCustomerPlaybook
} from '@ai-growth-ops/database';
import { initSkills } from '@ai-growth-ops/skills';

export interface CustomerPlaybookGenerateInput {
  customerId: string;
  organizationId: string;
}

export async function handleCustomerPlaybookGenerate(
  job: Job<CustomerPlaybookGenerateInput>
): Promise<void> {
  initSkills();
  const db = createDatabaseClient();
  const { customerId, organizationId } = job.data;

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null }
  });
  if (!customer) {
    job.log(`Customer ${customerId} not found, skipping`);
    return;
  }

  const result = await generateCustomerPlaybook(
    db,
    customerId,
    organizationId
  );

  job.log(
    `Playbook generated (${result.generatedBy}): ${result.playbook.summary.slice(0, 80)}`
  );
}
