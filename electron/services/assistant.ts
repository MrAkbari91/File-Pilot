import type { AssistantIntent, SearchInput } from '../../shared/contracts';

export function interpret(text: string, now = new Date()): AssistantIntent {
  const query = text.trim().toLowerCase();
  if (
    /^(organize|sort) (my |the )?(files|folder|downloads)( folder)? by (file type|category|extension|date)$/.test(
      query,
    )
  )
    return {
      supported: true,
      action: 'organize',
      explanation:
        'Choose an indexed folder and sorting strategy, then review the proposed moves. Nothing moves until you approve.',
    };
  if (
    /^(find|show)( me)? (duplicate files|duplicates|duplicate images|images with the same content)$/.test(
      query,
    )
  )
    return {
      supported: true,
      action: 'duplicates',
      explanation:
        'Open Duplicate Center and choose a comparison mode. Image similarity produces candidates for human review.',
    };
  if (/^create a rule for new (pdf )?files$/.test(query))
    return {
      supported: true,
      action: 'automation',
      explanation:
        'Create a preview-only rule for an explicitly selected folder. Scheduled rules prepare plans while FilePilot is open.',
    };
  const filters: SearchInput = {};
  const size = query.match(
    /^(?:find|show)(?: me)? files (?:larger than|over) (\d+(?:\.\d+)?)\s*(kb|mb|gb)$/,
  );
  if (size)
    filters.minSize = Number(size[1]) * ({ kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[size[2]!] ?? 1);
  else if (/^(find|show)( me)? large videos\.?$/.test(query)) {
    filters.category = 'Videos';
    filters.minSize = 100 * 1024 ** 2;
  } else if (/^(find|show)( me)? pdfs modified last month\.?$/.test(query)) {
    filters.extension = 'pdf';
    filters.modifiedAfter = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    filters.modifiedBefore = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else {
    const name = text
      .trim()
      .match(/^(?:find|show)(?: me)? files with (.+) in (?:their|the) name\.?$/i);
    if (name) filters.query = name[1]!.replace(/^['"]|['"]$/g, '');
    else
      return {
        supported: false,
        explanation:
          'I could not interpret that safely. Try “Find large videos”, “Show files larger than 500 MB”, “Show PDFs modified last month”, or use filename search.',
      };
  }
  return {
    supported: true,
    action: 'search',
    filters,
    explanation: `Search only your local index${filters.minSize ? ` for files larger than ${Math.round(filters.minSize / 1024 ** 2)} MB` : ''}. No files will be changed.`,
  };
}
