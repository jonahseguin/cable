import Image from 'next/image';
import Logo from '../../public/logo.png';
interface SockLogoProps {
  className?: string;
}

export default function SockLogo({ className = 'w-12 h-12' }: SockLogoProps) {
  return <Image src={Logo} alt="[removed] logo" width={256} height={256} className={className} />;
}
