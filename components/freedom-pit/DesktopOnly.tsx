export default function DesktopOnly() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <div className="mx-auto mb-8 h-32 w-full max-w-xs rounded-sm bg-gradient-to-b from-[#e0c893] via-[#c9ad78] to-[#3d2c18]" />
      <h2 className="font-serif text-2xl font-medium text-gray-900">Freedom Pit needs a keyboard</h2>
      <p className="mt-4 text-sm font-light leading-relaxed text-gray-600">
        It is a shovel-and-dodge game built around WASD and two action keys, and it would be a
        worse game squeezed onto a thumbstick. Come back on a laptop and I will put you to work.
      </p>
      <a
        href="/"
        className="mt-8 inline-block border border-gray-300 px-5 py-2 text-sm font-light tracking-wide text-gray-700 transition-colors hover:border-gray-700 hover:bg-gray-900 hover:text-white"
      >
        Back to the site
      </a>
    </div>
  );
}
