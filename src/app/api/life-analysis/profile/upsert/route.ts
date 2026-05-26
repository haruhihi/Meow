import { Prisma } from '@prisma/client';
import {
  IUserLifeAnalysisProfileUpsertReq,
  IUserLifeAnalysisProfileUpsertRes,
  UserLifeAnalysisProfileItem,
} from '@dtos/meow';
import { success, fail } from '@libs/fetch';
import { prisma } from '@libs/prisma';
import { getUID } from '@libs/session';

const toProfileItem = (profile: Awaited<ReturnType<typeof prisma.userLifeAnalysisProfile.upsert>>): UserLifeAnalysisProfileItem => ({
  id: profile.id,
  userId: profile.userId,
  profile: profile.profile,
  prompt: profile.prompt,
  createdAt: profile.createdAt.toISOString(),
  updatedAt: profile.updatedAt.toISOString(),
});

export async function POST(req: Request) {
  try {
    const uid = await getUID();
    if (!uid) throw new Error('unauthorized');

    const body = (await req.json()) as IUserLifeAnalysisProfileUpsertReq;
    if (!body.prompt?.trim()) throw new Error('prompt is required');

    const profile = await prisma.userLifeAnalysisProfile.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        profile: body.profile as Prisma.InputJsonValue,
        prompt: body.prompt,
      },
      update: {
        profile: body.profile as Prisma.InputJsonValue,
        prompt: body.prompt,
      },
    });

    return success<IUserLifeAnalysisProfileUpsertRes>({ profile: toProfileItem(profile) });
  } catch (error) {
    return fail(error);
  }
}