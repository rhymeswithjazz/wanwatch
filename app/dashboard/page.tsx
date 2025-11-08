import { auth, signOut } from '@/lib/auth';
import { redirect } from 'next/navigation';
import StatsDisplay from '@/components/stats-dashboard';

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h1 style={{ fontSize: '30px', fontWeight: 'bold', margin: 0 }}>
          WAN Connection Monitor
        </h1>
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </form>
      </div>
      <StatsDisplay />
    </div>
  );
}
