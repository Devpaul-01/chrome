type Props = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  message?: string;
};

export default function Spinner({ size = 'md', className = '', message }: Props) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <img
        src="./images/Birthday_messaging-custom_loader.gif"
        alt="Loading..."
        className={`${sizeClasses[size]} object-contain`}
        role="status"
        aria-label="Loading"
      />
      {message && <p className="text-sm text-gray-600 mt-2">{message}</p>}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
