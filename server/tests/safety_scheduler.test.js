const { confirmScheduleSchema, scheduleDraftSchema } = require('../src/validations/schemas');
const { generateDoseEventsForSchedule } = require('../src/services/scheduler');

describe('RecoverTrack Safety Rules & Review Gate Validation', () => {
  it('Safety Rule 1: Schema enforces review of 100% of fields before confirmation', () => {
    // Attempt confirmation with 1 field unverified (name: false)
    const incompleteReview = {
      scheduleId: '507f1f77bcf86cd799439011',
      reviewDurationSeconds: 15,
      reviewedFields: {
        name: false, // VIOLATION!
        strength: true,
        tabletsPerDose: true,
        doseTimes: true,
        foodTiming: true,
        duration: true,
        stock: true
      }
    };

    const result = confirmScheduleSchema.safeParse(incompleteReview);
    expect(result.success).toBe(false);
    expect(result.error.errors[0].message).toContain('Medicine name must be reviewed');
  });

  it('Safety Rule 1: Allows confirmation only when all 7 fields are verified and duration is recorded', () => {
    const fullReview = {
      scheduleId: '507f1f77bcf86cd799439011',
      reviewDurationSeconds: 22,
      reviewedFields: {
        name: true,
        strength: true,
        tabletsPerDose: true,
        doseTimes: true,
        foodTiming: true,
        duration: true,
        stock: true
      }
    };

    const result = confirmScheduleSchema.safeParse(fullReview);
    expect(result.success).toBe(true);
    expect(result.data.reviewDurationSeconds).toBe(22);
  });

  it('Safety Rule 1: Scheduler strictly ignores draft schedules', async () => {
    const draftSchedule = {
      _id: '507f1f77bcf86cd799439011',
      profileId: '507f1f77bcf86cd799439012',
      status: 'draft', // DRAFT
      doseTimes: ['08:00', '20:00'],
      tabletsPerDose: 1
    };

    const createdEvents = await generateDoseEventsForSchedule(draftSchedule, new Date());
    // Must return empty array and generate ZERO events or reminders!
    expect(createdEvents).toEqual([]);
  });

  it('Medicine form stepper supports half-tablets', () => {
    const validHalfTablet = {
      profileId: '507f1f77bcf86cd799439012',
      name: 'Crocin',
      strength: '500mg',
      type: 'tablet',
      tabletsPerDose: 0.5, // 0.5 tablet supported
      timesPerDay: 2,
      doseTimes: ['08:00', '20:00'],
      foodTiming: 'after food',
      tabletsInStock: 15
    };

    const parsed = scheduleDraftSchema.safeParse(validHalfTablet);
    expect(parsed.success).toBe(true);
    expect(parsed.data.tabletsPerDose).toBe(0.5);
  });
});
