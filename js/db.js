const db = new Dexie('AxisAutoLoansDB');

db.version(1).stores({
    users: '++id, username, role, status', // id is auto-incremented primary key, others are indexed
    loanFiles: '++id, roId, status, createdAt' 
});

// Seed initial admin user if not exists
async function seedDatabase() {
    const adminExists = await db.users.where('username').equals('admin').first();
    if (!adminExists) {
        await db.users.add({
            username: 'admin',
            password: 'password123', // In a real app, never store plain text passwords
            role: 'admin',
            name: 'System Admin',
            status: 'active',
            createdAt: new Date().toISOString()
        });
        console.log("Admin user seeded.");
    }
}

seedDatabase();
