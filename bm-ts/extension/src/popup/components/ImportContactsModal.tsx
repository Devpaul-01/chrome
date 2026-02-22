import { useState, DragEvent, ChangeEvent, useRef } from 'react';
import Spinner from './Spinner';

// Backend expects: name, facebook_profile_url, birthday, gender?, notes?
type ImportContact = {
  name: string;
  facebook_profile_url: string;
  birthday: string; // ISO date string
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  notes?: string;
};

type ImportContactsModalProps = {
  onClose: () => void;
  onImport: (contacts: ImportContact[]) => Promise<void>;
};

type TabType = 'upload' | 'preview';

export default function ImportContactsModal({ onClose, onImport }: ImportContactsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<ImportContact[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setError(null);
    setIsProcessing(true);

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['json', 'vcf', 'csv'].includes(extension || '')) {
      setError('Invalid file type. Please upload a .json, .vcf, or .csv file.');
      setIsProcessing(false);
      return;
    }

    try {
      const text = await file.text();
      let contacts: ImportContact[] = [];

      if (extension === 'json') {
        const parsed = JSON.parse(text);
        contacts = Array.isArray(parsed) ? parsed : [parsed];
      } else if (extension === 'csv') {
        contacts = parseCSV(text);
      } else if (extension === 'vcf') {
        contacts = parseVCF(text);
      }

      setSelectedFile(file);
      setParsedContacts(contacts);
      setActiveTab('preview');
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseCSV = (text: string): ImportContact[] => {
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const contacts: ImportContact[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const contact: any = {};

      headers.forEach((header, index) => {
        if (header === 'name') contact.name = values[index];
        if (
          header === 'facebook_profile_url' ||
          header === 'facebook_url' ||
          header === 'facebook'
        ) {
          contact.facebook_profile_url = values[index];
        }
        if (header === 'birthday' || header === 'birth_date') {
          contact.birthday = values[index];
        }
        if (header === 'gender') {
          const g = values[index].toLowerCase();
          if (g === 'male') contact.gender = 'MALE';
          else if (g === 'female') contact.gender = 'FEMALE';
          else if (g === 'other' || g === 'neutral') contact.gender = 'NEUTRAL';
        }
        if (header === 'notes' || header === 'note') {
          contact.notes = values[index];
        }
      });

      // Try to construct name from firstname/lastname if name not present
      if (!contact.name) {
        let firstName = '';
        let lastName = '';
        headers.forEach((header, index) => {
          if (header === 'firstname' || header === 'first_name') firstName = values[index];
          if (header === 'lastname' || header === 'last_name') lastName = values[index];
        });
        if (firstName || lastName) {
          contact.name = `${firstName} ${lastName}`.trim();
        }
      }

      if (contact.name && contact.facebook_profile_url && contact.birthday) {
        contacts.push(contact);
      }
    }

    return contacts;
  };

  const parseVCF = (text: string): ImportContact[] => {
    // Basic VCF parser - can be enhanced
    const contacts: ImportContact[] = [];
    const vCards = text.split('BEGIN:VCARD');

    for (const vCard of vCards.slice(1)) {
      const lines = vCard.split('\n');
      const contact: any = {};

      for (const line of lines) {
        if (line.startsWith('FN:')) {
          contact.name = line.substring(3).trim();
        }
        if (line.startsWith('URL') && line.includes('facebook')) {
          contact.facebook_profile_url = line.split(':')[1]?.trim();
        }
        if (line.startsWith('BDAY:')) {
          contact.birthday = line.substring(5).trim();
        }
        if (line.startsWith('NOTE:')) {
          contact.notes = line.substring(5).trim();
        }
      }

      // If no Facebook URL found, generate a placeholder
      if (contact.name && contact.birthday && !contact.facebook_profile_url) {
        contact.facebook_profile_url = `https://facebook.com/${contact.name.replace(/\s+/g, '.')}`;
      }

      if (contact.name && contact.facebook_profile_url && contact.birthday) {
        contacts.push(contact);
      }
    }

    return contacts;
  };

  const handleImport = async () => {
    try {
      // Map parsed contacts into backend ContactCreate shape
      const mapped = parsedContacts.map((c) => ({
        name: c.name,
        facebook_profile_url: c.facebook_profile_url,
        birthday: c.birthday,
        gender: c.gender,
        notes: c.notes,
      }));

      await onImport(mapped);
      onClose();
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-blueStrong">Import Contacts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 py-3 px-4 text-sm font-medium ${
              activeTab === 'upload'
                ? 'text-orangeBrand border-b-2 border-orangeBrand'
                : 'text-gray-600 hover:text-gray-800'
            }`}
            onClick={() => setActiveTab('upload')}
          >
            Upload
          </button>
          <button
            className={`flex-1 py-3 px-4 text-sm font-medium ${
              activeTab === 'preview'
                ? 'text-orangeBrand border-b-2 border-orangeBrand'
                : 'text-gray-600 hover:text-gray-800'
            }`}
            onClick={() => setActiveTab('preview')}
            disabled={parsedContacts.length === 0}
          >
            Preview
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'upload' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                You can upload a .json, .vcf, or .csv file to import your contacts.
              </p>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition ${
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
                  placeholder="Select a .json, .vcf, or .csv file"
                />
              </div>

              {isProcessing && (
                <div className="flex justify-center py-4">
                  <Spinner size="md" message="Processing file..." />
                </div>
              )}

              {error && <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Found {parsedContacts.length} contact{parsedContacts.length !== 1 ? 's' : ''} in{' '}
                {selectedFile?.name}
              </p>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {parsedContacts.map((contact, index) => (
                  <div key={index} className="p-3 border border-gray-200 rounded">
                    <p className="font-semibold">{contact.name}</p>
                    <p className="text-sm text-gray-600">{contact.facebook_profile_url}</p>
                    {contact.gender && (
                      <p className="text-xs text-gray-500 capitalize">{contact.gender}</p>
                    )}
                    {contact.notes && <p className="text-xs text-gray-500">{contact.notes}</p>}
                    <p className="text-xs text-orangeBrand">Birthday: {contact.birthday}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline-orange">
            Cancel
          </button>
          {activeTab === 'preview' && parsedContacts.length > 0 && (
            <button onClick={handleImport} className="btn-orange">
              Import {parsedContacts.length} Contact{parsedContacts.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
