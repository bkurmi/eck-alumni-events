import type { FeedbackQuestion } from '../types';

export const FEEDBACK_CAMPAIGN = {
  title: 'DeepAura 2K26 – Your Take! ❤️',
  tagline: 'A few clicks today, better reunions tomorrow.',
  closingQuote: {
    title: 'Thank you for being part of DeepAura 2K26! ❤️',
    message:
      'The memories we created today will last forever. Your feedback will help us make our next reunion even more memorable.',
    subMessage: 'Until we meet again... Keep the DeepAura alive! ✨',
  },
};

export const DEFAULT_FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  // ── Section 1: The Event Experience 🎉 ───────────────────────
  {
    id: 'overall_experience',
    section: 'event',
    type: 'emoji_scale',
    title: 'How was your overall DeepAura experience?',
    subtitle: 'Tap the emoji that best captures your mood today',
    options: [
      { emoji: '😍', label: 'Amazing!', value: 'amazing' },
      { emoji: '😊', label: 'Really Good!', value: 'good' },
      { emoji: '🙂', label: 'It was Nice', value: 'nice' },
      { emoji: '😐', label: 'Could be better', value: 'needs_work' },
    ],
    required: true,
  },
  {
    id: 'venue_arrangement',
    section: 'event',
    type: 'rating',
    title: 'How was the venue and event arrangement?',
    subtitle: 'Rating from 1 (Poor) to 5 (Outstanding)',
    required: true,
  },
  {
    id: 'reconnecting_buddies',
    section: 'event',
    type: 'radio',
    title: 'How did you enjoy reconnecting with your college buddies?',
    options: [
      { emoji: '😍', label: 'Loved every second!', value: 'loved_it' },
      { emoji: '😊', label: 'Great catching up', value: 'great' },
      { emoji: '🙂', label: 'Good, but missed a few folks', value: 'good' },
      { emoji: '😐', label: 'Could have been better', value: 'could_be_better' },
    ],
    required: true,
  },
  {
    id: 'favourite_parts',
    section: 'event',
    type: 'chips',
    title: 'What was your favourite part of the event?',
    subtitle: 'Select all that made you smile (tap multiple)',
    allowMultiple: true,
    options: [
      { emoji: '🤝', label: 'Meeting old friends', value: 'friends' },
      { emoji: '📸', label: 'Reliving college memories', value: 'memories' },
      { emoji: '🎵', label: 'Music, dance & entertainment', value: 'music' },
      { emoji: '🎓', label: 'Meeting faculty & batchmates', value: 'faculty' },
      { emoji: '🍲', label: 'Food & refreshments', value: 'food' },
      { emoji: '✨', label: 'Everything was magical!', value: 'everything' },
    ],
  },
  {
    id: 'event_improvements',
    section: 'event',
    type: 'textarea',
    title: 'What could we have done better for DeepAura 2K26?',
    placeholder: 'Optional: e.g. seating comfort, food varieties, stage timing, sound levels...',
    required: false,
  },

  // ── Section 2: The Digital Experience 💻 ─────────────────────
  {
    id: 'portal_experience',
    section: 'digital',
    type: 'rating',
    title: 'How was your experience registering through our alumni portal?',
    subtitle: 'Online registration, UPI QR flow & instant confirmation',
    required: true,
  },
  {
    id: 'gate_pass_easy',
    section: 'digital',
    type: 'radio',
    title: 'Was downloading your Digital Alumni Badge / Gate Pass easy?',
    options: [
      { emoji: '👍', label: 'Super easy & smooth', value: 'yes' },
      { emoji: '🤏', label: 'Somewhat / Took a few tries', value: 'somewhat' },
      { emoji: '👎', label: 'Faced issues / Needed help', value: 'no' },
    ],
    required: true,
  },
  {
    id: 'portal_navigation',
    section: 'digital',
    type: 'rating',
    title: 'Was the overall portal easy to navigate on your mobile device?',
    subtitle: 'Design, loading speed and clarity',
    required: true,
  },
  {
    id: 'portal_ease',
    section: 'digital',
    type: 'radio',
    title: 'Did the alumni portal make your registration and event entry easier?',
    options: [
      { emoji: '🚀', label: 'Much easier than traditional Google forms & manual lists!', value: 'much_easier' },
      { emoji: '👍', label: 'Yes, fairly smooth and convenient', value: 'smooth' },
      { emoji: '🤏', label: 'About the same / Could be simpler', value: 'could_be_simpler' },
    ],
    required: true,
  },
  {
    id: 'portal_improvements',
    section: 'digital',
    type: 'textarea',
    title: 'What would you improve in the alumni portal?',
    placeholder: 'Optional: e.g. simpler photo upload, more batch filters, email reminders...',
    required: false,
  },

  // ── Section 3: Heart & Alumni Connection ❤️ ──────────────────
  {
    id: 'after_deepaura_feeling',
    section: 'heart',
    type: 'textarea',
    title: 'Complete this sentence: "After attending DeepAura 2K26, I feel..."',
    subtitle: 'Express your feelings freely in your own words ❤️',
    placeholder: 'e.g. Back in my college days with my gang, proud of our community, and already waiting for the next reunion...',
    required: false,
  },
  {
    id: 'next_reunion_wish',
    section: 'heart',
    type: 'textarea',
    title: 'One thing you want us to remember while planning our next reunion?',
    placeholder: 'Tell us candidly — venue idea, activities, timings, nostalgic surprises...',
    required: false,
  },
  {
    id: 'stay_connected',
    section: 'heart',
    type: 'radio',
    title: 'Would you like to stay connected with the ECK-RTU Alumni Community for future initiatives?',
    options: [
      { emoji: '✅', label: 'Yes, absolutely!', value: 'yes_absolutely' },
      { emoji: '🤝', label: 'Already connected & active', value: 'already_connected' },
      { emoji: 'ℹ️', label: "I'd like to know more details", value: 'more_info' },
    ],
    required: true,
  },
];
