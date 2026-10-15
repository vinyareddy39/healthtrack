const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['caregiver', 'patient', 'doctor'], {
    errorMap: () => ({ message: "Role must be one of: caregiver, patient, doctor" })
  }),
  linkedPatientProfileId: z.string().optional().nullable(),
  accessibleProfileIds: z.array(z.string()).optional()
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const createProfileSchema = z.object({
  name: z.string().min(1, 'Patient name is required'),
  relation: z.enum(['Me', 'Mom', 'Dad', 'Spouse', 'Child', 'Other']).default('Me'),
  whatsappNumber: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  timezone: z.string().default('Asia/Kolkata'),
  surgeryType: z.string().optional().nullable(),
  dischargeDate: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable()
});

const updateProfileSchema = createProfileSchema.partial();

const scheduleDraftSchema = z.object({
  profileId: z.string().min(1, 'Profile ID is required'),
  name: z.string().min(1, 'Medicine name is required'),
  strength: z.string().default('500mg'),
  type: z.enum(['tablet', 'capsule', 'syrup', 'injection', 'inhaler', 'drops', 'sachet', 'other']).default('tablet'),
  tabletsPerDose: z.number().positive().default(1.0),
  timesPerDay: z.number().int().min(1).max(8).default(1),
  doseTimes: z.array(z.string()).min(1, 'At least one dose time is required'),
  foodTiming: z.enum(['before food', 'after food', 'with food', 'any time']).default('after food'),
  daysOfWeek: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).default(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  tabletsInStock: z.number().min(0).default(10),
  lowStockThresholdDays: z.number().int().default(5),
  ocrExtracted: z.boolean().default(false),
  ocrConfidence: z.number().optional().nullable(),
  sourceLine: z.string().optional().nullable()
});

const confirmScheduleSchema = z.object({
  scheduleId: z.string().min(1, 'Schedule ID is required'),
  reviewDurationSeconds: z.number().min(0, 'Review time must be recorded'),
  reviewedFields: z.object({
    name: z.boolean().refine(val => val === true, 'Medicine name must be reviewed'),
    strength: z.boolean().refine(val => val === true, 'Strength must be reviewed'),
    tabletsPerDose: z.boolean().refine(val => val === true, 'Tablets per dose must be reviewed'),
    doseTimes: z.boolean().refine(val => val === true, 'Dose times must be reviewed'),
    foodTiming: z.boolean().refine(val => val === true, 'Food timing must be reviewed'),
    duration: z.boolean().refine(val => val === true, 'Duration must be reviewed'),
    stock: z.boolean().refine(val => val === true, 'Tablets in stock must be reviewed')
  })
});

const doseActionSchema = z.object({
  action: z.enum(['taken', 'snooze', 'skip', 'undo', 'taken_late']),
  doseEventId: z.string().min(1, 'Dose Event ID is required'),
  snoozeMinutes: z.number().optional().default(30),
  notes: z.string().optional()
});

const refillSchema = z.object({
  scheduleId: z.string().min(1, 'Schedule ID is required'),
  addedTablets: z.number().positive('Quantity must be greater than zero')
});

module.exports = {
  registerSchema,
  loginSchema,
  createProfileSchema,
  updateProfileSchema,
  scheduleDraftSchema,
  confirmScheduleSchema,
  doseActionSchema,
  refillSchema
};
