export const GRADE_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];

export const SETUP_TYPES = ['GUS', 'IP', 'Subbie', 'D2', 'MDR', 'Situational', 'Other'];

export const TEMP_OPTIONS = ['Great', 'Good', 'Neutral', 'Tired', 'Stressed', 'Anxious', 'Frustrated'];

export const SIZE_PRESETS = ['25%', '30%', '50%', '75%', 'Full'];

export const STORAGE_KEY = 'tradePlanner_data';

export function createEmptyDay(dateStr, previousDay = null) {
  return {
    date: dateStr,
    header: {
      xScore: '',
      grade: '',
      weeklyGoal: previousDay?.header?.weeklyGoal || '',
      dailyGoal: '',
      reminders: previousDay?.header?.reminders || '',
      tempBefore: '',
      tempBeforeComments: '',
      tempDuring: '',
      tempDuringComments: '',
      tempAfter: '',
      tempAfterComments: '',
      overview: '',
    },
    trades: [],
    summary: {
      whatDidWell: '',
      whatLearned: '',
      whatToImprove: '',
    },
  };
}

export function createEmptyTrade() {
  return {
    id: crypto.randomUUID(),
    ticker: '',
    setup: '',
    setupNotes: '',
    dilutionNotes: '',
    grade: '',
    size: '',
    entryPlan: '',
    exitPlan: '',
    emotions: '',
    executionNotes: '',
    rResult: '',
    timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    collapsed: false,
  };
}
