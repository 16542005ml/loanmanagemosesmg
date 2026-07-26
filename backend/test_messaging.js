const API = 'http://127.0.0.1:4000/api';

async function testMessaging() {
    console.log("=========================================");
    console.log(" MESSAGING WORKFLOW TEST SUITE");
    console.log("=========================================\n");

    const results = { passed: 0, failed: 0, errors: [] };
    let adminToken = null;
    let memberToken = null;
    let testMemberId = null;
    const ts = Date.now();
    const testEmail = `msg_test_${ts}@test.com`;
    const memberPassword = 'password123';

    async function post(endpoint, body, useMemberToken = false) {
        const headers = { 'Content-Type': 'application/json' };
        const token = useMemberToken ? memberToken : adminToken;
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(`${API}/${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        const d = await r.json();
        if (!r.ok || d.status === 'fail' || d.success === false) {
             throw new Error(`${r.status}: ${d.message || d.redirect || 'Error'}`);
        }
        return d;
    }

    async function get(endpoint, useMemberToken = false) {
        const headers = {};
        const token = useMemberToken ? memberToken : adminToken;
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(`${API}/${endpoint}`, { headers });
        const d = await r.json();
        if (!r.ok || d.status === 'fail') throw new Error(`${r.status}: ${d.message || 'Error'}`);
        return d;
    }

    async function test(name, fn) {
        process.stdout.write(` [TEST] ${name}... `);
        try {
            await fn();
            results.passed++;
            console.log(` PASS`);
        } catch (e) {
            results.failed++;
            results.errors.push({ name, error: e.message });
            console.log(` FAIL (${e.message})`);
        }
    }

    try {
        // 1. Admin Authentication
        console.log("\n--- ADMIN AUTHENTICATION ---");
        await test("Register test admin", async () => {
            const res = await post('auth/register', { 
                adminName: 'Test Admin', adminEmail: `test_admin_${ts}@test.com`, adminPassword: 'password123', adminConfirm: 'password123'
            });
        });

        await test("Login as test admin", async () => {
            const res = await post('auth/login', { email: `test_admin_${ts}@test.com`, password: 'password123' });
            adminToken = res.token;
            if (!adminToken) throw new Error("No authorization token received");
            console.log(`    Token: ${adminToken.substring(0, 30)}...`);
        });

        // 2. Member Setup
        console.log("\n--- MEMBER SETUP ---");
        await test("Register test member", async () => {
            const res = await post('members/create', { 
                full_name: 'Messaging Test Member', email: testEmail, phone: '0700999888', password: memberPassword, pin: '1234' 
            });
            testMemberId = res.data.id;
            console.log(`    Member ID: ${testMemberId}`);
        });

        await test("Approve test member", async () => {
            if (!testMemberId) throw new Error("No member ID");
            await post('members/process-approval', { id: testMemberId, action: 'approve' });
        });

        await test("Get approved member ID", async () => {
            const pools = await get('members/dashboard-pools');
            const found = pools.data.approved.find(m => m.email === testEmail);
            if (!found) throw new Error("Member not found in approved pool");
            testMemberId = found.id;
            console.log(`    Approved Member ID: ${testMemberId}`);
        });

        await test("Login as member for authenticated requests", async () => {
            const res = await post('members/login', { identifier: testEmail, password: memberPassword });
            memberToken = res.token;
            if (!memberToken) throw new Error("No member token received");
            console.log(`    Member Token: ${memberToken.substring(0, 30)}...`);
        });

        // 3. Admin Send Message to Member
        console.log("\n--- ADMIN SEND MESSAGE ---");
        await test("Admin sends message to member", async () => {
            if (!testMemberId) throw new Error("No member ID");
            const res = await post('messages/send', {
                subject: `Test Message ${ts}`,
                body: 'This is a test message from admin to member',
                target_member_id: testMemberId
            });
            if (res.sent !== true) throw new Error("Message not marked as sent");
            console.log(`    Target Member ID: ${testMemberId}`);
        });

        // 4. Verify Message in Admin Inbox
        console.log("\n--- ADMIN MESSAGE INBOX ---");
        await test("Fetch admin message inbox", async () => {
            const res = await get('messages/inbox');
            if (!res.data || !Array.isArray(res.data)) throw new Error("Invalid inbox response");
            console.log(`    Inbox count: ${res.data.length}`);
        });

        await test("Verify message in admin inbox", async () => {
            const res = await get('messages/inbox');
            const found = res.data.find(m => m.subject === `Test Message ${ts}`);
            if (!found) throw new Error("Message not found in admin inbox");
            console.log(`    Message ID: ${found.id}, Sender: ${found.sender_role}, Read: ${found.is_read}`);
        });

        // 5. Verify Member Can Receive Message
        console.log("\n--- MEMBER MESSAGE INBOX ---");
        await test("Fetch member message inbox", async () => {
            const res = await get(`messages/member-inbox/${testMemberId}`, true);
            if (!res.data || !Array.isArray(res.data)) throw new Error("Invalid member inbox response");
            console.log(`    Member inbox count: ${res.data.length}`);
        });

        await test("Verify message in member inbox", async () => {
            const res = await get(`messages/member-inbox/${testMemberId}`, true);
            const found = res.data.find(m => m.subject === `Test Message ${ts}`);
            if (!found) throw new Error("Message not found in member inbox");
            console.log(`    Message ID: ${found.id}, Sender: ${found.sender_role}, Read: ${found.is_read}`);
        });

        // 6. Test Member Reply to Admin
        console.log("\n--- MEMBER REPLY ---");
        await test("Member sends reply to admin", async () => {
            const res = await post('messages/send', {
                subject: `Re: Test Message ${ts}`,
                body: 'This is a reply from member to admin'
            }, true);
            if (res.sent !== true) throw new Error("Reply not marked as sent");
        });

        await test("Verify reply in admin inbox", async () => {
            const res = await get('messages/inbox');
            const found = res.data.find(m => m.subject === `Re: Test Message ${ts}`);
            if (!found) throw new Error("Reply not found in admin inbox");
            console.log(`    Reply ID: ${found.id}, Sender: ${found.sender_role}`);
        });

        // 7. Test Mark as Read
        console.log("\n--- MARK AS READ ---");
        await test("Mark messages as read", async () => {
            const inbox = await get('messages/inbox');
            const ids = inbox.data.map(m => m.id);
            if (ids.length === 0) throw new Error("No messages to mark as read");
            await post('messages/mark-read', { ids });
            console.log(`    Marked ${ids.length} messages as read`);
        });

        await test("Verify messages marked as read", async () => {
            const res = await get('messages/inbox');
            const unread = res.data.filter(m => m.is_read === 0);
            if (unread.length > 0) throw new Error(`${unread.length} messages still unread`);
            console.log(`    All messages marked as read`);
        });

    } catch (e) {
        console.error("\nFATAL ERROR:", e.message);
        results.failed++;
        results.errors.push({ name: 'Test Suite', error: e.message });
    }

    console.log("\n=========================================");
    console.log(`RESULTS: ${results.passed} Passed | ${results.failed} Failed`);
    console.log("=========================================");
    if (results.errors.length > 0) {
        console.log("Failure Details:");
        results.errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
    } else {
        console.log(" ALL MESSAGING TESTS PASSED.");
    }
}

testMessaging();
