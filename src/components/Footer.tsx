import React from 'react';

interface FooterProps {
  eventName?: string;
  tagline?: string;
  location?: string;
}

export const Footer: React.FC<FooterProps> = ({
  eventName = 'ECK-RTU Alumni DeepAura 2K26',
  tagline = '“दीप जले, यादें मुस्कुराएँ”',
  location = 'Kota, Rajasthan',
}) => {
  const currentYear = new Date().getFullYear();

  // Clean and format tagline to ensure beautiful Hindi quote representation
  const cleanTagline = tagline
    ? tagline.replace(/[।.]/g, '').trim()
    : '“दीप जले, यादें मुस्कुराएँ”';

  const formattedTagline = cleanTagline.startsWith('“') || cleanTagline.startsWith('"')
    ? cleanTagline
    : `“${cleanTagline}”`;

  return (
    <footer className="w-full border-t border-slate-800/80 bg-[#07080f] py-9 px-4 text-center mt-auto">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2.5 sm:gap-3">
        {/* Dual College & University Seals matching reference screenshot */}
        <div className="flex items-center justify-center gap-3.5 sm:gap-4">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-white p-1 border-2 border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.25)] flex items-center justify-center shrink-0">
            <img
              src="/logo-eck.png"
              alt="ECK Kota"
              className="h-full w-full object-contain"
              width="56"
              height="56"
              loading="lazy"
            />
          </div>
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-white p-1 border-2 border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.25)] flex items-center justify-center shrink-0">
            <img
              src="/logo-rtu.png"
              alt="RTU Kota"
              className="h-full w-full object-contain"
              width="56"
              height="56"
              loading="lazy"
            />
          </div>
        </div>

        {/* Chapter Title */}
        <h3 className="text-lg sm:text-2xl font-black text-white tracking-wide">
          ECK-RTU Alumni Kota Chapter
        </h3>

        {/* Traditional Slogan / Tagline in warm amber with Rozha One Devanagari styling */}
        <p className="text-base sm:text-xl text-amber-400 font-['Rozha_One',serif] tracking-wide">
          {formattedTagline}
        </p>

        {/* Event Edition & Location in warm amber-gold tone */}
        <p className="text-xs sm:text-sm text-amber-400/90 font-medium tracking-wide">
          {eventName} • {location}
        </p>

        {/* Copyright notice in muted slate */}
        <p className="text-xs sm:text-sm text-slate-400 pt-0.5">
          © {currentYear} ECK-RTU Alumni Kota Chapter. All Rights Reserved.
        </p>
      </div>
    </footer>
  );
};

