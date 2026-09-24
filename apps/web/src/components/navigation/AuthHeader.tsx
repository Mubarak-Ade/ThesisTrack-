import BrandMark from './BrandMark';

/** Logo bar shared by AuthLayout and StatusLayout. */
export default function AuthHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1400px] items-center px-6 py-4 md:px-10">
        <BrandMark />
      </div>
    </header>
  );
}
