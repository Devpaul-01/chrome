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
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm font-bold">{label}:</span>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={value === option.value ? 'btn-primary btn-pill' : 'btn-secondary btn-pill'}
            aria-pressed={value === option.value ? 'true' : 'false'}
            aria-label={option.label}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="gender-select" className="block mb-1 font-bold">
        {label}
      </label>
      <select
        id="gender-select"
        value={value}
        onChange={(e) => onChange(e.target.value as GenderOption)}
        className="input-field"
        aria-label="Gender selection"
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
