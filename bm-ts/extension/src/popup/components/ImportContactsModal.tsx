import { useState, DragEvent, ChangeEvent, useRef, useEffect } from 'react';
import Spinner from './Spinner';
import { sendBackgroundMessage } from '../api';
import { trapFocus } from '../../utils/accessibility';

// Backend expects: name, facebook_profile_url, birthday, gender?, notes?
type ImportContact = {
  name: string;
  facebook_profile_url: string;
  birthday: string; // ISO date string
  birthday_month_only?: boolean;
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  notes?: string;
};

type ScrapedContact = {
  name: string;
  facebook_profile_url: string;
  birthday?: string;
  monthOnly?: boolean;
};

type ImportContactsModalProps = {
  onClose: () => void;
  onImport: (contacts: ImportContact[]) => Promise<void>;
};

type SourceTab = 'facebook' | 'file';

const MONTH_NAMES: Record<string, string> = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December',
};

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate(),
  ).padStart(2, '0')}`;
}

export default function ImportContactsModal({ onClose, onImport }: ImportContactsModalProps) {
  const [sourceTab, setSourceTab] = useState<SourceTab>('facebook');
  const [showPreview, setShowPreview] = useState(false);
  const [parsedContacts, setParsedContacts] = useState<ImportContact[]>([]);
  const [missingDateCount, setMissingDateCount] = useState(0);
  const [monthOnlyCount, setMonthOnlyCount] = useState(0);
  const [monthOnlySet, setMonthOnlySet] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Trap keyboard focus within the modal while it is open
  useEffect(() => {
    if (dialogRef.current) return trapFocus(dialogRef.current);
  }, []);

  // ── Facebook scrape ────────────────────────────────────────────
  const handleScrapeFromFacebook = async () => {
    setError(null);
    setIsScraping(true);
    try {
      const scraped = await sendBackgroundMessage<ScrapedContact[]>({
        type: 'contacts.scrapeFromFacebook',
      });
      if (!scraped || scraped.length === 0) {
        setError(
          'No birthday contacts found. Make sure facebook.com/birthdays is open and fully loaded, then try again.',
        );
        return;
      }
      const today = todayISO();
      let missing = 0;
      let monthOnly = 0;
      const monthOnlyIndices = new Set<number>();
      const mapped: ImportContact[] = scraped.map((c, idx) => {
        if (!c.birthday) missing++;
        if (c.monthOnly) {
          monthOnly++;
          monthOnlyIndices.add(idx);
        }
        return {
          name: c.name,
          facebook_profile_url: c.facebook_profile_url,
          birthday: c.birthday ?? today,
          birthday_month_only: c.monthOnly ?? false,
        };
      });
      setMissingDateCount(missing);
      setMonthOnlyCount(monthOnly);
      setMonthOnlySet(monthOnlyIndices);
      setParsedContacts(mapped);
      setShowPreview(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsScraping(false);
    }
  };

  // ── File upload ────────────────────────────────────────────────
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const processFile = async (file: File) => {
    setError(null);
    setIsProcessing(true);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['json', 'vcf', 'csv'].includes(ext ?? '')) {
      setError('Invalid file type. Please upload a .json, .vcf, or .csv file.');
      setIsProcessing(false);
      return;
    }
    try {
      const text = await file.text();
      let contacts: ImportContact[] = [];
      if (ext === 'json') {
        const parsed = JSON.parse(text);
        contacts = Array.isArray(parsed) ? parsed : [parsed];
      } else if (ext === 'csv') {
        contacts = parseCSV(text);
      } else if (ext === 'vcf') {
        contacts = parseVCF(text);
      }
      setSelectedFileName(file.name);
      setMissingDateCount(0);
      setParsedContacts(contacts);
      setShowPreview(true);
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseCSV = (text: string): ImportContact[] => {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const contacts: ImportContact[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = {};
      headers.forEach((h, idx) => {
        if (h === 'name') c.name = values[idx];
        if (['facebook_profile_url', 'facebook_url', 'facebook'].includes(h))
          c.facebook_profile_url = values[idx];
        if (['birthday', 'birth_date'].includes(h)) c.birthday = values[idx];
        if (h === 'gender') {
          const g = values[idx].toUpperCase();
          if (['MALE', 'FEMALE', 'NEUTRAL'].includes(g)) c.gender = g;
        }
        if (['notes', 'note'].includes(h)) c.notes = values[idx];
      });
      if (!c.name) {
        let fn = '',
          ln = '';
        headers.forEach((h, idx) => {
          if (['firstname', 'first_name'].includes(h)) fn = values[idx];
          if (['lastname', 'last_name'].includes(h)) ln = values[idx];
        });
        if (fn || ln) c.name = `${fn} ${ln}`.trim();
      }
      if (c.name && c.facebook_profile_url && c.birthday) contacts.push(c);
    }
    return contacts;
  };

  const parseVCF = (text: string): ImportContact[] => {
    const contacts: ImportContact[] = [];
    for (const vCard of text.split('BEGIN:VCARD').slice(1)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = {};
      for (const line of vCard.split('\n')) {
        if (line.startsWith('FN:')) c.name = line.substring(3).trim();
        if (line.startsWith('URL') && line.toLowerCase().includes('facebook'))
          c.facebook_profile_url = line.split(':').slice(1).join(':').trim();
        if (line.startsWith('BDAY:')) c.birthday = line.substring(5).trim();
        if (line.startsWith('NOTE:')) c.notes = line.substring(5).trim();
      }
      if (c.name && c.birthday) {
        if (!c.facebook_profile_url)
          c.facebook_profile_url = `https://facebook.com/${c.name.replace(/\s+/g, '.')}`;
        contacts.push(c);
      }
    }
    return contacts;
  };

  // ── Confirm import ─────────────────────────────────────────────
  const handleImport = async () => {
    try {
      await onImport(parsedContacts);
      onClose();
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleBack = () => {
    setShowPreview(false);
    setParsedContacts([]);
    setMissingDateCount(0);
    setMonthOnlyCount(0);
    setMonthOnlySet(new Set());
    setError(null);
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex: 9999 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-contacts-title"
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 flex-shrink-0">
          <h2 id="import-contacts-title" className="text-xl font-semibold text-blueStrong">
            {showPreview ? 'Preview Contacts' : 'Import Contacts'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {!showPreview ? (
          <>
            {/* Source tabs */}
            <div className="flex border-b border-gray-200 flex-shrink-0">
              <button
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  sourceTab === 'facebook'
                    ? 'text-orangeBrand border-b-2 border-orangeBrand'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
                onClick={() => {
                  setSourceTab('facebook');
                  setError(null);
                }}
              >
                From Facebook
              </button>
              <button
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  sourceTab === 'file'
                    ? 'text-orangeBrand border-b-2 border-orangeBrand'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
                onClick={() => {
                  setSourceTab('file');
                  setError(null);
                }}
              >
                From File
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {sourceTab === 'facebook' ? (
                <div className="space-y-5">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Import your friends&apos; birthdays directly from Facebook. The extension will
                    scan the Friends&apos; Birthdays page and extract names, profile URLs and
                    birthday dates.
                  </p>

                  {/* Steps */}
                  <ol className="space-y-3 text-sm">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orangeBrand text-white text-xs font-bold flex items-center justify-center">
                        1
                      </span>
                      <span className="text-gray-700">
                        Open{' '}
                        <a
                          href="https://www.facebook.com/birthdays"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blueStrong underline hover:text-blueBrand"
                          onClick={(e) => {
                            e.preventDefault();
                            chrome.tabs.create({ url: 'https://www.facebook.com/birthdays' });
                          }}
                        >
                          facebook.com/birthdays
                        </a>{' '}
                        or navigate to <strong>Friends &gt; Birthdays</strong> on Facebook, and wait
                        for the page to fully load.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orangeBrand text-white text-xs font-bold flex items-center justify-center">
                        2
                      </span>
                      <span className="text-gray-700">
                        Scroll down to load more birthdays if needed, then come back here and click
                        <strong> Scan Facebook</strong> below.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orangeBrand text-white text-xs font-bold flex items-center justify-center">
                        3
                      </span>
                      <span className="text-gray-700">
                        Review the contacts found and confirm the import.
                      </span>
                    </li>
                  </ol>

                  {error && (
                    <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  {isScraping ? (
                    <div className="flex justify-center py-4">
                      <Spinner size="md" message="Scanning Facebook birthdays page..." />
                    </div>
                  ) : (
                    <button onClick={handleScrapeFromFacebook} className="btn-orange w-full">
                      Scan Facebook
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Upload a <strong>.csv</strong>, <strong>.json</strong>, or <strong>.vcf</strong>{' '}
                    file containing contacts with <code>name</code>,{' '}
                    <code>facebook_profile_url</code>, and
                    <code> birthday</code> fields.
                  </p>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ${
                      isDragging
                        ? 'border-blueBrand bg-blue-50'
                        : 'border-blueStrong hover:border-blueBrand'
                    }`}
                  >
                    <div className="text-4xl mb-2">📁</div>
                    <p className="text-sm text-gray-600">
                      Drag and drop your file here
                      <br />
                      or click to select a file
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,.vcf,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                      title="Upload contacts file"
                    />
                  </div>
                  {isProcessing && (
                    <div className="flex justify-center py-4">
                      <Spinner size="md" message="Processing file..." />
                    </div>
                  )}
                  {error && (
                    <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
                      {error}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end flex-shrink-0">
              <button onClick={onClose} className="btn-outline-orange">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Preview */}
            <div className="p-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-700 font-medium">
                  Found <span className="text-orangeBrand font-bold">{parsedContacts.length}</span>{' '}
                  contact{parsedContacts.length !== 1 ? 's' : ''}
                  {selectedFileName ? ` in ${selectedFileName}` : ' on the Facebook page'}
                </p>
                {missingDateCount > 0 && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 rounded px-2 py-1">
                    {missingDateCount} with unknown birthday
                  </span>
                )}
                {monthOnlyCount > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-800 border border-blue-300 rounded px-2 py-1">
                    {monthOnlyCount} with month only
                  </span>
                )}
              </div>
              {missingDateCount > 0 && (
                <p className="text-xs text-gray-500 mb-3">
                  Contacts marked with ⚠ had no birthday found on the page — today&apos;s date has
                  been set as a placeholder. Edit the contact after import to correct it.
                </p>
              )}
              {monthOnlyCount > 0 && (
                <p className="text-xs text-gray-500 mb-3">
                  Contacts marked with 📅 only had a birth month visible on Facebook — the day has
                  been set to the 1st. Edit the contact after import to set the exact day.
                </p>
              )}
              <div className="space-y-2">
                {parsedContacts.map((c, i) => (
                  <div key={i} className="p-3 border border-gray-200 rounded text-sm">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-gray-500 truncate">{c.facebook_profile_url}</p>
                    <p
                      className={`text-xs mt-0.5 ${
                        monthOnlySet.has(i)
                          ? 'text-blue-600'
                          : c.birthday === todayISO() && missingDateCount > 0
                            ? 'text-yellow-600'
                            : 'text-orangeBrand'
                      }`}
                    >
                      {monthOnlySet.has(i)
                        ? `📅 Birth month: ${MONTH_NAMES[c.birthday.split('-')[1]] ?? c.birthday}`
                        : c.birthday === todayISO() && missingDateCount > 0
                          ? `⚠ Birthday: ${c.birthday}`
                          : `Birthday: ${c.birthday}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="mx-4 mb-2 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="p-4 border-t border-gray-200 flex justify-between flex-shrink-0">
              <button onClick={handleBack} className="btn-outline-orange">
                Back
              </button>
              <button onClick={handleImport} className="btn-orange">
                Import {parsedContacts.length} Contact{parsedContacts.length !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
