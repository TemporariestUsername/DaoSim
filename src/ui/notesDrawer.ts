import type { Detection } from '../sim/fieldNotes';

export interface JournalEntry extends Detection {
  /** sim-clock label at first observation */
  observedAt: string;
  /** small PNG data URL captured from the fine layer */
  thumbnail: string;
}

export interface NotesDrawerHandle {
  el: HTMLElement;
  button: HTMLButtonElement;
  toggle: () => void;
  /** returns true if the detection was new and got journaled */
  record: (d: Detection, thumbnail: string) => boolean;
  has: (id: string) => boolean;
}

const STORAGE_KEY = 'daosim.fieldnotes';

function loadEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: JournalEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage unavailable — the journal just won't survive a reload
  }
}

/**
 * Field Notes (spec 3.3): a naturalist's journal, not an achievement list.
 * Each regime is logged once, with a timestamped thumbnail, the first time
 * it is observed. Purely observational — the only progression-like element.
 */
export function createNotesDrawer(): NotesDrawerHandle {
  const entries = loadEntries();
  const seen = new Set(entries.map((e) => e.id));

  const el = document.createElement('div');
  el.id = 'notes-drawer';
  el.className = 'notes-drawer hidden';

  const title = document.createElement('div');
  title.className = 'notes-title';
  title.textContent = 'Field Notes';
  el.appendChild(title);

  const list = document.createElement('div');
  list.className = 'notes-list';
  el.appendChild(list);

  const empty = document.createElement('div');
  empty.className = 'notes-empty';
  empty.textContent = 'Nothing observed yet. Watch. Wait.';
  el.appendChild(empty);

  const button = document.createElement('button');
  button.textContent = 'Notes';

  function renderEntry(entry: JournalEntry): void {
    empty.style.display = 'none';
    const row = document.createElement('div');
    row.className = 'notes-entry';

    const img = document.createElement('img');
    img.src = entry.thumbnail;
    img.alt = '';
    img.width = 56;
    img.height = 56;

    const body = document.createElement('div');
    body.className = 'notes-entry-body';
    const name = document.createElement('div');
    name.className = 'notes-entry-name';
    name.textContent = entry.name;
    const desc = document.createElement('div');
    desc.className = 'notes-entry-desc';
    desc.textContent = entry.description;
    const time = document.createElement('div');
    time.className = 'notes-entry-time';
    time.textContent = entry.observedAt;
    body.appendChild(name);
    body.appendChild(desc);
    body.appendChild(time);

    row.appendChild(img);
    row.appendChild(body);
    list.prepend(row);
  }

  for (const entry of entries) renderEntry(entry);
  updateButton();

  function updateButton(): void {
    button.textContent = entries.length > 0 ? `Notes (${entries.length})` : 'Notes';
  }

  return {
    el,
    button,
    toggle: () => el.classList.toggle('hidden'),
    has: (id) => seen.has(id),
    record: (d, thumbnail) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      const entry: JournalEntry = {
        ...d,
        observedAt: new Date().toLocaleString(),
        thumbnail,
      };
      entries.push(entry);
      saveEntries(entries);
      renderEntry(entry);
      updateButton();
      button.classList.add('notes-new');
      setTimeout(() => button.classList.remove('notes-new'), 2500);
      return true;
    },
  };
}
