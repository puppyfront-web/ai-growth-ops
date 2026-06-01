import type { ContentItem } from './content';
import type { PublishJob } from './publish';

export type CalendarItem =
  | { kind: 'content'; item: ContentItem }
  | { kind: 'publish'; job: PublishJob };
