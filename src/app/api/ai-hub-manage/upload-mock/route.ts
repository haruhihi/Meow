import { success, fail } from '@libs/fetch';

export async function POST() {
  try {
    return success({ url: 'https://www.google.com/logos/doodles/2025/celebrating-cherry-blossom-season-6753651837110633-law.gif' });
  } catch (error) {
    return fail(error);
  }
}
