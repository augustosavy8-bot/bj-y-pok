"use client";

// Superficie de fieltro con marco de madera/carbón — la "mesa real" que
// envuelve la cámara del crupier y las cartas comunitarias/manos.
export function SuperficieFieltro({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`marco-carbon rounded-[28px] p-2 shadow-mesa ${className}`}>
      <div className="superficie-fieltro relative overflow-hidden rounded-3xl shadow-mesa">
        {children}
      </div>
    </div>
  );
}
