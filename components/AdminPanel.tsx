import React, { useState } from 'react';
import { X, Palette, Type, Zap } from 'lucide-react';
import { ImageStylesAdmin } from './ImageStylesAdmin';
import { SubtitlesAdmin } from './SubtitlesAdmin';
import { MotionEffectsAdmin } from './MotionEffectsAdmin';

type AdminSection = 'styles' | 'subtitles' | 'effects';

interface AdminPanelProps {
    onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
    const [activeSection, setActiveSection] = useState<AdminSection>('styles');

    const sections = [
        { id: 'styles' as AdminSection, label: 'Estilos de Imagem', icon: Palette },
        { id: 'subtitles' as AdminSection, label: 'Legendas', icon: Type },
        { id: 'effects' as AdminSection, label: 'Efeitos de Movimento', icon: Zap },
    ];

    return (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[200] overflow-y-auto">
            <div className="max-w-7xl mx-auto px-6 py-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-2">
                            Painel <span className="text-brand-400">Administrativo</span>
                        </h1>
                        <p className="text-sm text-slate-500 mt-2">Gerencie estilos, legendas e efeitos da aplicação</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Navigation */}
                <div className="flex gap-4 mb-8 border-b border-slate-800 pb-4">
                    {sections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black uppercase text-xs transition-all ${activeSection === section.id
                                        ? 'bg-brand-600 text-white'
                                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                            >
                                <Icon size={16} />
                                {section.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="bg-slate-900/50 rounded-3xl p-8 border border-slate-800">
                    {activeSection === 'styles' && <ImageStylesAdmin />}
                    {activeSection === 'subtitles' && <SubtitlesAdmin />}
                    {activeSection === 'effects' && <MotionEffectsAdmin />}
                </div>
            </div>
        </div>
    );
};
