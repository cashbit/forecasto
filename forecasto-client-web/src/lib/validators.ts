import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(6, 'Password deve avere almeno 6 caratteri'),
})

export const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve avere almeno 2 caratteri'),
  email: z.string().email('Email non valida'),
  password: z.string().min(6, 'Password deve avere almeno 6 caratteri'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Le password non coincidono',
  path: ['confirmPassword'],
})

export const recordSchema = z.object({
  type: z.string().min(1, 'Tipo obbligatorio'),
  account: z.string().min(1, 'Conto obbligatorio'),
  reference: z.string().min(1, 'Riferimento obbligatorio'),
  note: z.string().optional(),
  date_cashflow: z.string().min(1, 'Data cashflow obbligatoria'),
  date_offer: z.string().min(1, 'Data offerta obbligatoria'),
  amount: z.string().min(1, 'Importo obbligatorio'),
  vat: z.string().optional(),
  stage: z.string().min(1, 'Stato obbligatorio'),
})

export const sessionSchema = z.object({
  title: z.string().min(1, 'Titolo obbligatorio').max(100, 'Titolo troppo lungo'),
})

export const commitSchema = z.object({
  message: z.string().min(1, 'Messaggio obbligatorio').max(500, 'Messaggio troppo lungo'),
})

export const projectSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  code: z.string().min(1, 'Codice obbligatorio'),
  description: z.string().optional(),
  client: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  budget_amount: z.string().optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type RecordFormData = z.infer<typeof recordSchema>
export type SessionFormData = z.infer<typeof sessionSchema>
export type CommitFormData = z.infer<typeof commitSchema>
export type ProjectFormData = z.infer<typeof projectSchema>
