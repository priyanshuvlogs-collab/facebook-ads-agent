import { Router } from "express";
import { z } from "zod";
import { prisma } from "@yta/database";
import type { Prisma } from "@yta/database";
import { API_CATEGORIES, API_STATUSES, FREE_TIER_QUALITIES, NotFoundError } from "@yta/shared";
import { asyncHandler, ok, parse } from "../http";

const listQuerySchema = z.object({
  category: z.enum(API_CATEGORIES).optional(),
  minStars: z.coerce.number().int().min(0).optional(),
  updatedWithinDays: z.coerce.number().int().min(1).max(3650).optional(),
  freeTierQuality: z.enum(FREE_TIER_QUALITIES).optional(),
  status: z.enum(API_STATUSES).optional(),
  search: z.string().max(200).optional(),
  sort: z
    .enum(["overallScore", "stars", "lastCommitAt", "firstSeenAt"])
    .default("overallScore"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

const updateSchema = z.object({
  status: z.enum(API_STATUSES).optional(),
  category: z.enum(API_CATEGORIES).optional(),
  freeTierNotes: z.string().max(2000).nullable().optional(),
});

export const apisRouter = Router();

/** GET /api/apis - filterable, sortable, paginated directory of free APIs. */
apisRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parse(listQuerySchema, req.query);

    const where: Prisma.DiscoveredApiWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.minStars !== undefined ? { stars: { gte: query.minStars } } : {}),
      ...(query.freeTierQuality ? { freeTierQuality: query.freeTierQuality } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.updatedWithinDays !== undefined
        ? {
            lastCommitAt: {
              gte: new Date(Date.now() - query.updatedWithinDays * 86_400_000),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { topics: { has: query.search.toLowerCase() } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.discoveredApi.count({ where }),
      prisma.discoveredApi.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          endpoints: { take: 5 },
          usageExamples: { take: 2 },
        },
      }),
    ]);

    ok(res, {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    });
  })
);

/** GET /api/apis/stats - aggregate stats for the dashboard. */
apisRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [total, byCategory, byFreeTier, topApis] = await Promise.all([
      prisma.discoveredApi.count(),
      prisma.discoveredApi.groupBy({
        by: ["category"],
        _count: { _all: true },
        orderBy: { _count: { category: "desc" } },
      }),
      prisma.discoveredApi.groupBy({
        by: ["freeTierQuality"],
        _count: { _all: true },
      }),
      prisma.discoveredApi.findMany({
        orderBy: { overallScore: "desc" },
        take: 5,
        select: {
          id: true,
          fullName: true,
          category: true,
          stars: true,
          overallScore: true,
          freeTierQuality: true,
        },
      }),
    ]);

    ok(res, {
      total,
      byCategory: byCategory.map((row) => ({
        category: row.category,
        count: row._count._all,
      })),
      byFreeTier: byFreeTier.map((row) => ({
        freeTierQuality: row.freeTierQuality,
        count: row._count._all,
      })),
      topApis,
    });
  })
);

/** GET /api/apis/:id - full detail including endpoints and examples. */
apisRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const api = await prisma.discoveredApi.findUnique({
      where: { id: req.params.id },
      include: { endpoints: true, usageExamples: true },
    });
    if (!api) throw new NotFoundError("API not found");
    ok(res, api);
  })
);

/** PATCH /api/apis/:id - curate status/category/notes. */
apisRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parse(updateSchema, req.body);
    const existing = await prisma.discoveredApi.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("API not found");

    const api = await prisma.discoveredApi.update({
      where: { id: req.params.id },
      data: body,
      include: { endpoints: true, usageExamples: true },
    });
    ok(res, api);
  })
);
