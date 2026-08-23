import { describe, test, assert } from "../test-harness.js";

describe("Linen Inventory security rules", () => {
  test("limits colleague records to owned documents and reserves deletion for privileged users", async () => {
    const response = await fetch("../firestore.rules");
    assert.ok(response.ok, "Failed to fetch firestore.rules");
    const rules = await response.text();
    assert.includes(rules, "ownsExistingLinenInventoryRecord");
    assert.includes(rules, "ownsNewLinenInventoryRecord");
    assert.includes(rules, "linenColleagueUpdateAllowed");
    assert.includes(rules, "linenActorMatchesRequester");
    assert.includes(rules, "linenUpdateSubmissionAuditValid");
    assert.includes(rules, "linenTargetsAreEmpty");
    assert.includes(rules, "linenTargetsUnchanged");
    assert.includes(rules, "request.resource.data.targets == resource.data.targets");
    assert.includes(rules, "request.resource.data.reviewNote == ''");
    assert.includes(rules, "request.resource.data.workflowStatus == resource.data.workflowStatus");
    assert.includes(rules, "request.resource.data.propertyId == resource.data.propertyId");
    assert.includes(rules, "allow delete: if privileged()");
    assert.ok(!rules.includes("allow read, write: if privileged() || hasApp('linenInventory')"));
    const propertyDirectoryRule = rules.match(/function canReadPropertyDirectory\(\) \{([\s\S]*?)\n    \}/)?.[1] || "";
    assert.ok(!propertyDirectoryRule.includes("linenInventory"));
    const sanitizedDirectoryRule = rules.match(/match \/propertyDirectory\/\{propertyId\} \{([\s\S]*?)\n    \}/)?.[1] || "";
    assert.includes(sanitizedDirectoryRule, "hasApp('linenInventory')");
    assert.includes(sanitizedDirectoryRule, "hasOnly(['name', 'updatedAt'])");
    assert.ok(!sanitizedDirectoryRule.includes("allow write"));
  });

  test("serves colleagues a sanitized property directory instead of full property records", async () => {
    const [functionResponse, mainResponse] = await Promise.all([
      fetch("../functions/index.js"),
      fetch("../js/app/main.js")
    ]);
    assert.ok(functionResponse.ok, "Failed to fetch functions/index.js");
    assert.ok(mainResponse.ok, "Failed to fetch main.js");
    const functionsSource = await functionResponse.text();
    const mainSource = await mainResponse.text();
    const callable = functionsSource.match(/exports\.getLinenInventoryPropertyDirectory[\s\S]*?(?=exports\.createPasswordResetLink)/)?.[0] || "";

    assert.includes(callable, 'requireAppAccess(request, "linenInventory")');
    assert.includes(callable, 'id: String(document.id || "").slice(0, 160)');
    assert.includes(callable, "name: name || \"\"");
    assert.includes(callable, "return { properties };");
    assert.includes(mainSource, "getLinenInventoryPropertyDirectory");
    assert.includes(mainSource, "propertyDirectory");
  });

  test("limits linen photo writes to the colleague's own storage folder", async () => {
    const response = await fetch("../storage.rules");
    assert.ok(response.ok, "Failed to fetch storage.rules");
    const rules = await response.text();
    const block = rules.match(/match \/linen-inventory\/\{ownerUid\}\/\{fileName\} \{([\s\S]*?)\n    \}/)?.[1] || "";

    assert.includes(block, "request.auth.uid == ownerUid");
    assert.includes(block, "hasLinenInventoryAccess");
    assert.includes(block, "image/");
    assert.includes(block, "allow update, delete: if privileged()");
  });
});
