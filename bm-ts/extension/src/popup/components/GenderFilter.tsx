export type GenderOption = 'MALE' | 'FEMALE' | 'NEUTRAL' | 'ALL';

interface GenderFilterProps {
  value: GenderOption;
  onChange: (gender: GenderOption) => void;
  showAll?: boolean;
  label?: string;
  inline?: boolean;
}

export default function GenderFilter({
  value,
  onChange,
  showAll = true,
  label = 'Gender Filter',
  inline = false,
}: GenderFilterProps) {
  const options: { value: GenderOption; label: string }[] = [
    ...(showAll ? [{ value: 'ALL' as GenderOption, label: 'All Genders' }] : []),
    { value: 'NEUTRAL', label: 'Neutral' },
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
  ];

  if (inline) {
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{label}:</span>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={value === option.value ? 'button-primary' : 'button-secondary'}
            style={{
              fontSize: '13px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as GenderOption)}
        style={{ width: '100%', padding: '8px' }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
