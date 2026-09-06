import { displayWailistRecentUsersFlag, displayWaitlistCountFlag } from '@/lib/flags';
import { NextResponse } from 'next/server';
import { db } from '@[removed]/db';
import { waitlist } from '@[removed]/db/schema';
import { sql, ne } from 'drizzle-orm';

/**
 * API route handler for fetching waitlist count and recent users
 * Returns a count of -2 and empty recentUsers array to hide UI elements
 * Database queries are commented out but kept for easy re-enabling
 */
export async function GET() {
  try {
    const [displayWaitlistCount, displayWailistRecentUsers] = await Promise.all([
      displayWaitlistCountFlag(),
      displayWailistRecentUsersFlag(),
    ]);

    let count = -2;
    let recentUsers: { username: string | null; avatarUrl: string | null }[] = [];

    if (displayWaitlistCount) {
      count = await db.$count(waitlist);
    }

    // Get the three most recent users (not used in response but keeps the query for future use)
    if (displayWailistRecentUsers) {
      recentUsers = await db
        .select({
          username: waitlist.username,
          avatarUrl: waitlist.avatarUrl,
        })
        .from(waitlist)
        .where(ne(waitlist.avatarUrl, ''))
        .orderBy(sql`${waitlist.createdAt} DESC`)
        .limit(50);
    }

    // Return count as -2 to hide UI elements
    return NextResponse.json({
      count,
      recentUsers,
    });
  } catch (_error) {
    return NextResponse.json(
      {
        count: -2,
        recentUsers: [],
      },
      { status: 500 },
    );
  }
}
