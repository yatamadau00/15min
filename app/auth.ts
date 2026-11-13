import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { getUser } from '../lib/auth/core';
export async function getGoogleUser() { return getUser((await headers()).get('cookie'), env); }
