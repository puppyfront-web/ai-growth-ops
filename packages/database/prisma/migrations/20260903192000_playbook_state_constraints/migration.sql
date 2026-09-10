CREATE UNIQUE INDEX "customer_playbooks_one_draft_per_customer"
  ON "customer_playbooks"("customerId")
  WHERE "status" = 'draft';

CREATE UNIQUE INDEX "customer_playbooks_one_active_per_customer"
  ON "customer_playbooks"("customerId")
  WHERE "status" = 'active';
