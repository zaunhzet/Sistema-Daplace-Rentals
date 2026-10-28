export type NavigationItemStatus = 'DISPONIBLE' | 'PENDIENTE';

export type DeveloperResponsible = 'André' | 'Diego' | 'Compartido';

export type NavigationGroup =
  | 'Principal'
  | 'Gestión Inmobiliaria'
  | 'Finanzas'
  | 'Operaciones';

export interface NavigationItem {
  id: string;
  name: string;
  path: string;
  icon: string;
  description: string;
  status: NavigationItemStatus;
  responsible: DeveloperResponsible;
  group: NavigationGroup;
  badge?: string;
}

export interface SidebarProps {
  currentPath: string;
  onNavigate?: (path: string, item: NavigationItem) => void;
  items?: NavigationItem[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}
