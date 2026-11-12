// Totality is checked where the catalog types its loaders, not here: annotating against
// the English object would pin every value to its English literal.
export const messaging = {
  "messaging.inbox.title": "বার্তা",
  "messaging.inbox.empty": "এখনও কোনও কথোপকথন নেই। একটি শুরু করলে এখানে দেখা যাবে।",
  "messaging.inbox.error": "আপনার কথোপকথনগুলি লোড করা যায়নি।",
  "messaging.inbox.loadMore": "পুরনো দেখুন",
  "messaging.inbox.open": "বার্তা খুলুন",
  "messaging.inbox.unread": "{count}টি অপঠিত",
  "messaging.inbox.direct": "সরাসরি বার্তা",
  "messaging.member.unknown": "কেউ একজন",

  "messaging.conversation.empty": "এখনও কোনও বার্তা নেই। কিছু বলুন।",
  "messaging.conversation.error": "এই কথোপকথনটি লোড করা যায়নি।",
  "messaging.conversation.loadOlder": "পুরনো বার্তা দেখুন",
  "messaging.conversation.archived":
    "{month} পর্যন্ত বার্তাগুলো আর্কাইভ করা আছে। একজন প্ল্যাটফর্ম প্রশাসক এগুলো ফিরিয়ে আনতে পারেন।",
  "messaging.thread.rootArchived":
    "এই থ্রেডের শুরুটা আর্কাইভ করা আছে। একজন প্ল্যাটফর্ম প্রশাসক এটি ফিরিয়ে আনতে পারেন।",
  "messaging.conversation.deleted": "এই বার্তাটি মুছে ফেলা হয়েছে।",
  "messaging.conversation.edited": "সম্পাদিত",
  "messaging.conversation.leave": "কথোপকথন ছাড়ুন",
  "messaging.conversation.members": "এই কথোপকথনে",

  "messaging.compose.placeholder": "একটি বার্তা লিখুন",
  "messaging.compose.send": "পাঠান",
  "messaging.compose.hint": "পাঠাতে Enter, নতুন লাইনের জন্য Shift+Enter",
  "messaging.compose.tooLong": "বার্তাটি খুব দীর্ঘ।",
  "messaging.compose.failed": "বার্তাটি পাঠানো যায়নি।",

  "messaging.create.title": "নতুন কথোপকথন",
  "messaging.create.submit": "শুরু করুন",
  "messaging.create.name": "নাম",
  "messaging.create.people": "সদস্য",
  "messaging.create.hint":
    "একজন সদস্য ও কোনো নাম না দিলে সরাসরি বার্তা শুরু হয়; নাম দিলে বা একাধিক সদস্য বাছলে একটি গ্রুপ হয়।",
  "messaging.create.nobody": "এই প্রতিষ্ঠানে এখনো আর কেউ নেই।",

  "messaging.typing.one": "{name} লিখছেন…",
  "messaging.typing.many": "একাধিক জন লিখছেন…",
  "messaging.presence.online": "এখন অনলাইনে: {names}",
  "messaging.compose.mention": "উল্লেখ করুন…",
  "messaging.reaction.add": "প্রতিক্রিয়া দিন",
  "messaging.reaction.toggle": "{emoji} প্রতিক্রিয়া: {count}",
  "messaging.attachment.add": "ফাইল যুক্ত করুন",
  "messaging.attachment.remove": "{name} সরান",
  "messaging.attachment.open": "{name} খুলুন",
  "messaging.attachment.failed": "ফাইলটি আপলোড করা যায়নি।",
  "messaging.thread.reply": "উত্তর দিন",
  "messaging.thread.replies": "উত্তর: {count}",
  "messaging.thread.title": "থ্রেড",
  "messaging.thread.more": "আরও উত্তর দেখুন",
} as const;
