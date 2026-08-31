import { z } from 'zod'

export const accountingStandardSchema = z.enum(['CAS', 'IFRS', 'US-GAAP'])

export const securitySchema = z.object({
  exchange: z.string().trim().min(1),
  ticker: z.string().trim().min(1),
  security_type: z.string().trim().min(1),
})

export const companyManifestSchema = z.object({
  schema_version: z.literal('0.1'),
  company_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name_zh: z.string().trim().min(1).optional(),
  name_en: z.string().trim().min(1).optional(),
  website: z.url().optional(),
  jurisdiction: z.string().trim().min(2).max(3),
  accounting_standard: accountingStandardSchema,
  primary_industry: z.string().trim().min(1).optional(),
  securities: z.array(securitySchema).default([]),
}).refine((manifest) => manifest.name_zh || manifest.name_en, {
  message: 'At least one company name is required',
})

export type CompanyManifest = z.infer<typeof companyManifestSchema>
export type Security = z.infer<typeof securitySchema>

